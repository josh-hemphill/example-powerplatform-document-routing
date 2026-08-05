import type { ConnectionProfile } from './connection-config.ts';
import type { DataverseProvisionPlan, WebApiRequestPlan } from './dataverse-provision-plan.ts';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConnectionProfile } from './connection-config.ts';
import { buildControlSeedBundle } from './control-seed.ts';
import {
	buildDataverseProvisionPlan,
} from './dataverse-provision-plan.ts';
import {
	buildPaConnectCommands,
	renderPaCommandsScript,
} from './pa-connect-commands.ts';

export interface ProvisionArtifacts {
	plan: DataverseProvisionPlan;
	outputDir: string;
	files: string[];
	validationErrors: string[];
	validationWarnings: string[];
}

export interface ApplyResult {
	applied: number;
	skipped: number;
	failed: Array<{ description: string; error: string }>;
}

/** Documented Dataverse / OData duplicate conditions we treat as idempotent success. */
const IDEMPOTENT_DUPLICATE_STATUS = new Set([409, 412]);
const IDEMPOTENT_ERROR_CODES = [
	'0x80040237', // Duplicate record
	'0x80060882', // Entity key / duplicate
	'0x80044328', // Attribute already exists
	'duplicate',
	'already exists',
	'is already present',
];

/** Placeholder plan when validation failed — never call builders that parse hosts. */
export function emptyProvisionPlan(): DataverseProvisionPlan {
	return {
		apiRoot: '',
		prefix: '',
		schema: { tables: [], environmentVariables: [] },
		requests: [],
		environmentVariableDefaults: {},
		tableLogicalNames: [],
	};
}

/**
 * Writes provision plan JSON, env defaults, and pa connect script under deploy/generated.
 * On validation errors, no executable artifacts are written (atomic replace only on success).
 */
export function writeProvisionArtifacts(
	profile: ConnectionProfile,
	outputDir: string,
	options: { requireDeployableHosts?: boolean } = {},
): ProvisionArtifacts {
	const issues = validateConnectionProfile(profile, {
		requireDeployableHosts: options.requireDeployableHosts,
	});
	const validationErrors = issues
		.filter((issue) => issue.severity === 'error')
		.map((issue) => `${issue.field}: ${issue.message}`);
	const validationWarnings = issues
		.filter((issue) => issue.severity === 'warning')
		.map((issue) => `${issue.field}: ${issue.message}`);

	if (validationErrors.length > 0) {
		return {
			plan: emptyProvisionPlan(),
			outputDir,
			files: [],
			validationErrors,
			validationWarnings,
		};
	}

	const plan = buildDataverseProvisionPlan(profile);
	const commands = buildPaConnectCommands(profile, plan);
	const seed = buildControlSeedBundle(profile.publisher.prefix);

	const staging = mkdtempSync(join(tmpdir(), 'doc-routing-provision-'));
	const files: string[] = [];

	const write = (name: string, contents: string) => {
		const target = join(staging, name);
		writeFileSync(target, contents, 'utf8');
		files.push(join(outputDir, name));
	};

	try {
		write(
			'dataverse-webapi-plan.json',
			`${JSON.stringify(
				{
					apiRoot: plan.apiRoot,
					prefix: plan.prefix,
					tableLogicalNames: plan.tableLogicalNames,
					environmentVariableDefaults: plan.environmentVariableDefaults,
					requests: plan.requests,
				},
				null,
				2,
			)}\n`,
		);
		write('dataverse-schema.json', `${JSON.stringify(plan.schema, null, 2)}\n`);
		write(
			'environment-variable-defaults.json',
			`${JSON.stringify(plan.environmentVariableDefaults, null, 2)}\n`,
		);
		write('control-seed.json', `${JSON.stringify(seed, null, 2)}\n`);
		write('pa-connect.sh', renderPaCommandsScript(commands));
		write(
			'app.env.example',
			[
				'# Local Vite only — hosted Code Apps should use Power Platform / Dataverse env vars (dr_*).',
				`VITE_DOCUMENT_API_BASE_URL=${profile.api.baseUrl}`,
				`VITE_SHAREPOINT_SITE_URL=${profile.sharePoint.siteUrl}`,
				`VITE_SHAREPOINT_LIBRARY_NAME=${profile.sharePoint.libraryName}`,
				`VITE_SHAREPOINT_FOLDER_PATH=${profile.sharePoint.folderPath ?? ''}`,
				`VITE_DATAVERSE_ENVIRONMENT_URL=${profile.dataverse.environmentUrl}`,
				'',
			].join('\n'),
		);
		write(
			'SUMMARY.md',
			[
				'# Provision summary',
				'',
				`Publisher prefix: \`${plan.prefix}\``,
				`Dataverse Web API root: \`${plan.apiRoot}\``,
				'',
				'## Tables',
				...plan.tableLogicalNames.map((name) => `- \`${name}\``),
				'',
				'## Control seed',
				'',
				'Sample document types / pools from `src/config/document-types.ts` are mirrored in `control-seed.json` for Admin / import.',
				'Replace Contoso sample emails before production.',
				'',
				'## Next steps',
				'',
				'1. Set `DATAVERSE_ACCESS_TOKEN` and run `pnpm provision:apply` to create tables via Web API, **or** import a solution built from this schema.',
				'2. Review and run `pa-connect.sh` (replace `CONNECTION_ID`) to attach Code App data sources.',
				'3. Prefer Dataverse environment variables (`dr_*`) in hosted apps; use `app.env.example` for local Vite only.',
				'4. Load control seed (Admin UI in Phase 4, or manual Dataverse import) then remove sample identities.',
				'',
				validationWarnings.length
					? `## Warnings\n\n${validationWarnings.map((item) => `- ${item}`).join('\n')}\n`
					: '',
			].join('\n'),
		);

		mkdirSync(outputDir, { recursive: true });
		for (const name of [
			'dataverse-webapi-plan.json',
			'dataverse-schema.json',
			'environment-variable-defaults.json',
			'control-seed.json',
			'pa-connect.sh',
			'app.env.example',
			'SUMMARY.md',
		]) {
			renameSync(join(staging, name), join(outputDir, name));
		}
	}
	finally {
		rmSync(staging, { recursive: true, force: true });
	}

	return {
		plan,
		outputDir,
		files,
		validationErrors,
		validationWarnings,
	};
}

/**
 * Applies a Web API plan using a bearer token.
 * Existing tables are attribute-diffed; only documented duplicate conditions skip.
 */
export async function applyDataversePlan(
	plan: DataverseProvisionPlan,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ApplyResult> {
	const result: ApplyResult = { applied: 0, skipped: 0, failed: [] };
	const existingEntities = new Set<string>();

	for (const request of plan.requests) {
		try {
			const outcome = await executePlanRequest(
				plan.apiRoot,
				request,
				accessToken,
				fetchImpl,
				existingEntities,
			);
			if (outcome === 'applied') {
				result.applied += 1;
			}
			else {
				result.skipped += 1;
			}
		}
		catch(error) {
			result.failed.push({
				description: request.description,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return result;
}

async function executePlanRequest(
	apiRoot: string,
	request: WebApiRequestPlan,
	accessToken: string,
	fetchImpl: typeof fetch,
	existingEntities: Set<string>,
): Promise<'applied' | 'skipped'> {
	const headers = {
		'Authorization': `Bearer ${accessToken}`,
		'Accept': 'application/json',
		'Content-Type': 'application/json; charset=utf-8',
		'OData-MaxVersion': '4.0',
		'OData-Version': '4.0',
	};

	if (request.kind === 'entity' && request.entityLogicalName && request.skipIfExists) {
		const existing = await fetchImpl(
			`${apiRoot}/EntityDefinitions(LogicalName='${request.entityLogicalName}')?$select=LogicalName`,
			{ headers: { 'Authorization': headers.Authorization, 'Accept': headers.Accept, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } },
		);
		if (existing.ok) {
			existingEntities.add(request.entityLogicalName);
			return 'skipped';
		}
	}

	if (
		request.kind === 'attribute'
		&& request.entityLogicalName
		&& request.skipIfExists
	) {
		// Attributes are included in the initial entity create. Only POST missing ones
		// when the table already existed before this apply run.
		if (!existingEntities.has(request.entityLogicalName)) {
			return 'skipped';
		}
		const schemaName = String(
			(request.body as { SchemaName?: string }).SchemaName ?? '',
		);
		const logical = schemaName.toLowerCase();
		const attr = await fetchImpl(
			`${apiRoot}/EntityDefinitions(LogicalName='${request.entityLogicalName}')/Attributes(LogicalName='${logical}')?$select=LogicalName`,
			{ headers: { 'Authorization': headers.Authorization, 'Accept': headers.Accept, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } },
		);
		if (attr.ok) {
			return 'skipped';
		}
	}

	if (request.kind === 'relationship' && request.skipIfExists) {
		const schemaName = String(
			(request.body as { SchemaName?: string }).SchemaName ?? '',
		);
		const existing = await fetchImpl(
			`${apiRoot}/RelationshipDefinitions(SchemaName='${schemaName}')?$select=SchemaName`,
			{ headers: { 'Authorization': headers.Authorization, 'Accept': headers.Accept, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } },
		);
		if (existing.ok) {
			return 'skipped';
		}
	}

	const response = await fetchImpl(`${apiRoot}${request.path}`, {
		method: request.method,
		headers,
		body: request.body ? JSON.stringify(request.body) : undefined,
	});

	if (!response.ok) {
		const text = await response.text();
		if (request.skipIfExists && isDocumentedDuplicate(response.status, text)) {
			return 'skipped';
		}
		throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
	}

	return 'applied';
}

/**
 * True only for documented duplicate / already-exists conditions (not arbitrary 4xx).
 */
export function isDocumentedDuplicate(status: number, body: string): boolean {
	if (IDEMPOTENT_DUPLICATE_STATUS.has(status)) {
		return true;
	}
	const lower = body.toLowerCase();
	return IDEMPOTENT_ERROR_CODES.some((code) => lower.includes(code.toLowerCase()));
}
