import type { ConnectionProfile } from './connection-config.ts';
import type { DataverseProvisionPlan, WebApiRequestPlan } from './dataverse-provision-plan.ts';
import type { ExistingAttributeMetadata } from './schema-drift.ts';
import type { AlmManifest } from './solution-alm.ts';
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
import {
	assertAttributeTypeCompatible,

	plannedTypeFromAttributeBody,
} from './schema-drift.ts';
import {
	buildAlmManifest,
	renderSolutionPackMarkdown,
	renderSolutionPackScript,
} from './solution-alm.ts';

export interface ProvisionArtifacts {
	plan: DataverseProvisionPlan;
	almManifest: AlmManifest | null;
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
 * Writes provision plan JSON, env defaults, ALM guides, and pa connect script under deploy/generated.
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
			almManifest: null,
			outputDir,
			files: [],
			validationErrors,
			validationWarnings,
		};
	}

	const plan = buildDataverseProvisionPlan(profile);
	const almManifest = buildAlmManifest(profile, plan);
	const commands = buildPaConnectCommands(profile, plan);
	const seed = buildControlSeedBundle(profile.publisher.prefix);
	const envVarPattern = `${plan.prefix}_*`;

	const staging = mkdtempSync(join(tmpdir(), 'doc-routing-provision-'));
	const files: string[] = [];

	const write = (name: string, contents: string) => {
		const target = join(staging, name);
		writeFileSync(target, contents, 'utf8');
		files.push(join(outputDir, name));
	};

	const artifactNames = [
		'dataverse-webapi-plan.json',
		'dataverse-schema.json',
		'environment-variable-defaults.json',
		'control-seed.json',
		'alm-manifest.json',
		'solution-pack.md',
		'solution-pack.sh',
		'pa-connect.sh',
		'app.env.example',
		'SUMMARY.md',
	];

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
		write('alm-manifest.json', `${JSON.stringify(almManifest, null, 2)}\n`);
		write('solution-pack.md', renderSolutionPackMarkdown(almManifest));
		write('solution-pack.sh', renderSolutionPackScript(almManifest));
		write('pa-connect.sh', renderPaCommandsScript(commands));
		write(
			'app.env.example',
			[
				`# Local Vite only — hosted Code Apps should use Power Platform / Dataverse env vars (${envVarPattern}).`,
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
				'## Publisher & solution',
				'',
				`- Publisher unique name: \`${profile.publisher.uniqueName}\``,
				`- Publisher friendly name: \`${profile.publisher.friendlyName}\``,
				`- Publisher prefix: \`${plan.prefix}\``,
				`- Option value prefix: \`${almManifest.publisher.optionValuePrefix}\``,
				`- Solution unique name: \`${profile.solution.uniqueName}\``,
				`- Solution friendly name: \`${profile.solution.friendlyName}\``,
				`- Solution version: \`${profile.solution.version}\``,
				`- Preferred path: **solution** (\`pnpm provision:solution\`)`,
				`- Unmanaged apply allowed by profile: \`${Boolean(profile.allowUnmanagedApply)}\``,
				'',
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
				'## Next steps (shared environments)',
				'',
				'1. Run `DATAVERSE_ACCESS_TOKEN=… pnpm provision:solution` to ensure publisher ownership + unmanaged solution (prefix collisions fail closed).',
				'2. Follow `solution-pack.md` / `solution-pack.sh` to add components, export, and import managed into shared test/prod.',
				'3. Review and run `pa-connect.sh` (replace `CONNECTION_ID`) to attach Code App data sources (connection references arrive in Phase 19).',
				`4. Prefer Dataverse environment variables (\`${envVarPattern}\`) in hosted apps; use \`app.env.example\` for local Vite only.`,
				'5. Load control seed via Admin UI (or opt-in import) then remove sample identities.',
				'',
				'## Scratch / unmanaged apply (avoid in shared orgs)',
				'',
				'Direct Web API apply creates **unmanaged metadata outside a solution**.',
				'Only use `pnpm provision:apply --unmanaged-ok` (or set `allowUnmanagedApply: true` in the profile) for personal/dev scratch environments.',
				'To apply metadata and add tables into the profile solution instead, use `pnpm provision:apply --into-solution`.',
				'',
				validationWarnings.length
					? `## Warnings\n\n${validationWarnings.map((item) => `- ${item}`).join('\n')}\n`
					: '',
			].join('\n'),
		);

		mkdirSync(outputDir, { recursive: true });
		for (const name of artifactNames) {
			renameSync(join(staging, name), join(outputDir, name));
		}
	}
	finally {
		rmSync(staging, { recursive: true, force: true });
	}

	return {
		plan,
		almManifest,
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
			`${apiRoot}/EntityDefinitions(LogicalName='${request.entityLogicalName}')/Attributes(LogicalName='${logical}')?$select=LogicalName,AttributeType`,
			{ headers: { 'Authorization': headers.Authorization, 'Accept': headers.Accept, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } },
		);
		if (attr.ok) {
			const plannedType = plannedTypeFromAttributeBody(
				request.body as Record<string, unknown>,
			);
			if (plannedType) {
				const meta = (await attr.json()) as ExistingAttributeMetadata;
				assertAttributeTypeCompatible(plannedType, {
					LogicalName: meta.LogicalName ?? logical,
					AttributeType: meta.AttributeType,
				});
			}
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
