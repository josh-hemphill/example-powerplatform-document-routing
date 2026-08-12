import type { ConnectionProfile } from './connection-config.ts';
import type { DataverseProvisionPlan, WebApiRequestPlan } from './dataverse-provision-plan.ts';
import type { ExistingAttributeMetadata } from './schema-drift.ts';
import type { AlmManifest } from './solution-alm.ts';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConnectionProfile } from './connection-config.ts';
import { buildControlSeedBundle } from './control-seed.ts';
import {
	buildDataverseProvisionPlan,
} from './dataverse-provision-plan.ts';
import {
	generatePrefixedFlowArtifacts,
} from './flow-templates.ts';
import {
	buildPaConnectCommands,
	renderPaCommandsScript,
} from './pa-connect-commands.ts';
import {
	assertAttributeTypeCompatible,

	plannedTypeFromAttributeBody,
} from './schema-drift.ts';
import {
	buildSecurityRolePlans,
	renderSecurityRolesMarkdown,
} from './security-roles-plan.ts';
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
		environmentVariableSchemaNames: [],
		connectionReferences: [],
		tableLogicalNames: [],
	};
}

export interface ApplyPlanOptions {
	/** When set, associate env vars / connection refs with this unmanaged solution on create. */
	solutionUniqueName?: string;
	fetchImpl?: typeof fetch;
}

/**
 * Renders per-environment current-value guidance (no secrets committed).
 */
export function renderEnvironmentVariableValuesGuide(
	plan: DataverseProvisionPlan,
): string {
	const rows = plan.environmentVariableSchemaNames.map((schemaName) => {
		const seeded = plan.environmentVariableDefaults[schemaName] ?? '';
		const hint = seeded
			? `dev default seeded from profile (review before promoting): \`${seeded}\``
			: 'no profile default — set explicitly per environment';
		return `- \`${schemaName}\` — ${hint}`;
	});
	return [
		'# Environment variable current values',
		'',
		'Definitions are solution components. **Current values** are environment-specific — do not commit secrets to git.',
		'',
		'Hosted Code Apps should read these Dataverse / Power Platform environment variables (prefix from your publisher), not hardcoded `dr_*`.',
		'',
		'## Definitions in this plan',
		'',
		...rows,
		'',
		'## Per environment',
		'',
		'1. After importing the managed solution (or ensuring defs via `--into-solution`), open **Solutions → Environment variables** (or use Web API `environmentvariablevalues`).',
		'2. Set the **current value** for each schema name above to match that environment’s SharePoint site, API host, and Dataverse URL.',
		'3. Prefer current value over baking production URLs into `defaultvalue` on the definition.',
		'',
		'## Local Vite',
		'',
		'Use `app.env.example` / `VITE_*` for local mock only. Runtime injection uses `window.__DOCUMENT_ROUTING_ENV__` mapped from these env vars.',
		'',
	].join('\n');
}

/**
 * Writes provision plan JSON, env defaults, ALM guides, flows, roles, and pa connect script.
 * On validation errors, no executable artifacts are written (atomic replace only on success).
 */
export function writeProvisionArtifacts(
	profile: ConnectionProfile,
	outputDir: string,
	options: {
		requireDeployableHosts?: boolean;
		/** Include Contoso demo identities in control-seed.json (local only). */
		includeDemoIdentities?: boolean;
		flowTemplatesDir?: string;
	} = {},
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
	const includeDemoIdentities = options.includeDemoIdentities === true;
	const seed = buildControlSeedBundle(profile.publisher.prefix, undefined, {
		includeDemoIdentities,
	});
	const rolePlans = buildSecurityRolePlans(plan.prefix);
	const envVarPattern = `${plan.prefix}_*`;
	const templatesDir = options.flowTemplatesDir
		?? join(dirname(fileURLToPath(import.meta.url)), '../../deploy/flows');
	const flowArtifacts = generatePrefixedFlowArtifacts(templatesDir, plan.prefix);

	const staging = mkdtempSync(join(tmpdir(), 'doc-routing-provision-'));
	const files: string[] = [];

	const write = (name: string, contents: string) => {
		const target = join(staging, name);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, contents, 'utf8');
		files.push(join(outputDir, name));
	};

	const artifactNames = [
		'dataverse-webapi-plan.json',
		'dataverse-schema.json',
		'environment-variable-defaults.json',
		'environment-variable-values.md',
		'connection-references.json',
		'security-roles.json',
		'security-roles.md',
		'control-seed.json',
		'alm-manifest.json',
		'solution-pack.md',
		'solution-pack.sh',
		'pa-connect.sh',
		'app.env.example',
		'SUMMARY.md',
		...flowArtifacts.map((item) => join('flows', item.fileName)),
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
					environmentVariableSchemaNames: plan.environmentVariableSchemaNames,
					connectionReferences: plan.connectionReferences,
					securityRoles: almManifest.securityRoles,
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
		write(
			'environment-variable-values.md',
			renderEnvironmentVariableValuesGuide(plan),
		);
		write(
			'connection-references.json',
			`${JSON.stringify(plan.connectionReferences, null, 2)}\n`,
		);
		write('security-roles.json', `${JSON.stringify(rolePlans, null, 2)}\n`);
		write('security-roles.md', renderSecurityRolesMarkdown(rolePlans, plan.prefix));
		write('control-seed.json', `${JSON.stringify(seed, null, 2)}\n`);
		write('alm-manifest.json', `${JSON.stringify(almManifest, null, 2)}\n`);
		write('solution-pack.md', renderSolutionPackMarkdown(almManifest));
		write('solution-pack.sh', renderSolutionPackScript(almManifest));
		write('pa-connect.sh', renderPaCommandsScript(commands));
		for (const flow of flowArtifacts) {
			write(join('flows', flow.fileName), flow.contents);
		}
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
		const sharePointRef = plan.connectionReferences.find(
			(item) => item.purpose === 'sharepoint',
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
				`- Legacy direct pa-connect: \`${Boolean(profile.legacyDirectConnection)}\``,
				`- Demo control seed identities: \`${includeDemoIdentities}\``,
				'',
				`Dataverse Web API root: \`${plan.apiRoot}\``,
				'',
				'## Tables',
				...plan.tableLogicalNames.map((name) => `- \`${name}\``),
				'',
				'## Connection references',
				'',
				...plan.connectionReferences.map(
					(item) =>
						`- \`${item.logicalName}\` (${item.purpose}, \`${item.connectorId}\`)`,
				),
				'',
				'## Security roles',
				'',
				...almManifest.securityRoles.map(
					(role) => `- \`${role.displayName}\` (\`${role.token}\`)`,
				),
				'',
				'See `security-roles.md` for prefixed privilege guidance. Create roles inside the solution; production `/principal` returns these display names.',
				'',
				'## Environment variables',
				'',
				...plan.environmentVariableSchemaNames.map((name) => `- \`${name}\``),
				'',
				'See `environment-variable-values.md` for per-environment current-value guidance (do not commit secrets).',
				'',
				'## Flows',
				'',
				`Prefix-correct stubs are under \`flows/\` (from \`deploy/flows\` templates). Tables use \`${plan.prefix}_*\`.`,
				'Run flows as the Document Routing Service principal — never the end-user SPA token.',
				'',
				'## Control seed',
				'',
				includeDemoIdentities
					? 'Demo identities included (`--demo-seed`). Replace Contoso emails before any shared-org import.'
					: 'Shared-env safe seed (no Contoso emails). Use Admin to add real members, or regenerate with `--demo-seed` for local demos only.',
				'Control seed is **configuration/reference data**, not a solution component — import via Admin after solution deploy.',
				'',
				'## Next steps (shared environments)',
				'',
				'1. Follow [`deploy/SHARED_ENV.md`](../SHARED_ENV.md) (publisher → solution → refs → roles → managed import).',
				'2. Run `DATAVERSE_ACCESS_TOKEN=… pnpm provision:solution` to ensure publisher ownership + unmanaged solution.',
				'3. Run `pnpm provision:apply -- --into-solution` (or pack/import) so tables, env var definitions, and connection references land in the solution.',
				`4. Bind a real SharePoint connection to \`${sharePointRef?.logicalName ?? `${plan.prefix}_sharepoint`}\`, then review \`pa-connect.sh\`.`,
				`5. Set env var **current values** per environment (\`${envVarPattern}\`); use \`app.env.example\` for local Vite only.`,
				'6. Create/assign security roles from `security-roles.md`; configure the Flow service principal.',
				'7. Import generated `flows/` (or package into the solution) and smoke-test the Code App.',
				'',
				'## Scratch / unmanaged apply (avoid in shared orgs)',
				'',
				'Direct Web API apply creates **unmanaged metadata outside a solution**.',
				'Only use `pnpm provision:apply --unmanaged-ok` (or set `allowUnmanagedApply: true` in the profile) for personal/dev scratch environments.',
				'Set `legacyDirectConnection: true` only when you intentionally want connection-id wiring without connection references.',
				'To apply metadata and add components into the profile solution instead, use `pnpm provision:apply --into-solution`.',
				'',
				validationWarnings.length
					? `## Warnings\n\n${validationWarnings.map((item) => `- ${item}`).join('\n')}\n`
					: '',
			].join('\n'),
		);

		mkdirSync(outputDir, { recursive: true });
		mkdirSync(join(outputDir, 'flows'), { recursive: true });
		for (const name of artifactNames) {
			mkdirSync(dirname(join(outputDir, name)), { recursive: true });
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
 * Existing tables are attribute-diffed; env vars / connection refs use GET-before-POST.
 * When `solutionUniqueName` is set, env var and connection reference creates include
 * the `MSCRM.SolutionUniqueName` header.
 */
export async function applyDataversePlan(
	plan: DataverseProvisionPlan,
	accessToken: string,
	fetchImplOrOptions: typeof fetch | ApplyPlanOptions = fetch,
): Promise<ApplyResult> {
	const options: ApplyPlanOptions
		= typeof fetchImplOrOptions === 'function'
			? { fetchImpl: fetchImplOrOptions }
			: fetchImplOrOptions;
	const fetchImpl = options.fetchImpl ?? fetch;
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
				options.solutionUniqueName,
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
	solutionUniqueName?: string,
): Promise<'applied' | 'skipped'> {
	const headers: Record<string, string> = {
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

	if (request.kind === 'environmentvariable' && request.skipIfExists) {
		const schemaName
			= request.componentSchemaName
				?? String((request.body as { schemaname?: string }).schemaname ?? '');
		if (schemaName) {
			const filter = encodeURIComponent(
				`schemaname eq '${schemaName.replace(/'/g, '\'\'')}'`,
			);
			const existing = await fetchImpl(
				`${apiRoot}/environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname&$filter=${filter}`,
				{
					headers: {
						'Authorization': headers.Authorization,
						'Accept': headers.Accept,
						'OData-MaxVersion': '4.0',
						'OData-Version': '4.0',
					},
				},
			);
			if (existing.ok) {
				const payload = (await existing.json()) as { value?: unknown[] };
				if ((payload.value?.length ?? 0) > 0) {
					return 'skipped';
				}
			}
		}
	}

	if (request.kind === 'connectionreference' && request.skipIfExists) {
		const logicalName
			= request.componentSchemaName
				?? String(
					(request.body as { connectionreferencelogicalname?: string })
						.connectionreferencelogicalname ?? '',
				);
		if (logicalName) {
			const filter = encodeURIComponent(
				`connectionreferencelogicalname eq '${logicalName.replace(/'/g, '\'\'')}'`,
			);
			const existing = await fetchImpl(
				`${apiRoot}/connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname&$filter=${filter}`,
				{
					headers: {
						'Authorization': headers.Authorization,
						'Accept': headers.Accept,
						'OData-MaxVersion': '4.0',
						'OData-Version': '4.0',
					},
				},
			);
			if (existing.ok) {
				const payload = (await existing.json()) as { value?: unknown[] };
				if ((payload.value?.length ?? 0) > 0) {
					return 'skipped';
				}
			}
		}
	}

	if (
		solutionUniqueName
		&& (request.kind === 'environmentvariable' || request.kind === 'connectionreference')
	) {
		headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
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
