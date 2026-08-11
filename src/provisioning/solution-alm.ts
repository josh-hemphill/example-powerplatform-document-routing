/**
 * Solution-first ALM helpers: publisher ownership, solution ensure, pack guides.
 */
import type { ConnectionProfile } from './connection-config.ts';
import type { DataverseProvisionPlan } from './dataverse-provision-plan.ts';
import { DEFAULT_OPTION_VALUE_PREFIX } from './dataverse-schema.ts';
import { assertSafeCliToken, shellQuote } from './shell-quote.ts';

/** Dataverse solution component type for entities. */
export const SOLUTION_COMPONENT_ENTITY = 1;

export interface AlmManifest {
	publisher: {
		uniqueName: string;
		friendlyName: string;
		prefix: string;
		optionValuePrefix: number;
	};
	solution: {
		uniqueName: string;
		friendlyName: string;
		version: string;
	};
	environmentId: string;
	dataverseEnvironmentUrl: string;
	apiRoot: string;
	tableLogicalNames: string[];
	preferredPath: 'solution';
	unmanagedApply: {
		allowedByProfile: boolean;
		requiresCliFlag: true;
		warning: string;
	};
}

export interface PublisherRecord {
	publisherid: string;
	uniquename: string;
	friendlyname: string;
	customizationprefix: string;
	customizationoptionvalueprefix?: number;
}

export interface SolutionRecord {
	solutionid: string;
	uniquename: string;
	friendlyname: string;
	version: string;
}

export class PublisherCollisionError extends Error {
	readonly code = 'publisher_prefix_collision';
	readonly prefix: string;
	readonly existingUniqueName: string;
	readonly expectedUniqueName: string;

	constructor(
		prefix: string,
		existingUniqueName: string,
		expectedUniqueName: string,
	) {
		super(
			`Publisher prefix "${prefix}" is already owned by "${existingUniqueName}" `
			+ `(expected "${expectedUniqueName}"). Choose a different publisher.prefix `
			+ `or reuse that publisher's uniqueName in deploy/connections.json.`,
		);
		this.name = 'PublisherCollisionError';
		this.prefix = prefix;
		this.existingUniqueName = existingUniqueName;
		this.expectedUniqueName = expectedUniqueName;
	}
}

/**
 * Builds a machine-readable ALM manifest from the connection profile + plan.
 */
export function buildAlmManifest(
	profile: ConnectionProfile,
	plan: DataverseProvisionPlan,
): AlmManifest {
	return {
		publisher: {
			uniqueName: profile.publisher.uniqueName,
			friendlyName: profile.publisher.friendlyName,
			prefix: profile.publisher.prefix.toLowerCase(),
			optionValuePrefix:
				profile.publisher.optionValuePrefix ?? DEFAULT_OPTION_VALUE_PREFIX,
		},
		solution: {
			uniqueName: profile.solution.uniqueName,
			friendlyName: profile.solution.friendlyName,
			version: profile.solution.version,
		},
		environmentId: profile.powerPlatform.environmentId,
		dataverseEnvironmentUrl: profile.dataverse.environmentUrl.replace(/\/$/, ''),
		apiRoot: plan.apiRoot,
		tableLogicalNames: [...plan.tableLogicalNames],
		preferredPath: 'solution',
		unmanagedApply: {
			allowedByProfile: Boolean(profile.allowUnmanagedApply),
			requiresCliFlag: true,
			warning:
				'Direct Web API apply creates unmanaged metadata outside a solution. '
				+ 'Prefer `pnpm provision:solution` in shared Power Platform environments.',
		},
	};
}

/**
 * Renders human + PAC-oriented solution pack guidance.
 */
export function renderSolutionPackMarkdown(manifest: AlmManifest): string {
	const { publisher, solution } = manifest;
	return [
		'# Solution pack guide (shared-environment path)',
		'',
		'Prefer this path over unmanaged `pnpm provision:apply` in multi-team orgs.',
		'',
		'## Profile',
		'',
		`- Publisher unique name: \`${publisher.uniqueName}\``,
		`- Publisher friendly name: \`${publisher.friendlyName}\``,
		`- Publisher prefix: \`${publisher.prefix}\``,
		`- Option value prefix: \`${publisher.optionValuePrefix}\``,
		`- Solution unique name: \`${solution.uniqueName}\``,
		`- Solution friendly name: \`${solution.friendlyName}\``,
		`- Solution version: \`${solution.version}\``,
		`- Environment id: \`${manifest.environmentId}\``,
		`- Dataverse URL: \`${manifest.dataverseEnvironmentUrl}\``,
		'',
		'## Tables to own in the solution',
		'',
		...manifest.tableLogicalNames.map((name) => `- \`${name}\``),
		'',
		'## Steps',
		'',
		'1. Run `pnpm provision:solution` with `DATAVERSE_ACCESS_TOKEN` to **ensure** the publisher and unmanaged solution (prefix collision fails closed).',
		'2. Create or import schema components into that solution (Web API apply with `--into-solution`, or PAC / maker portal).',
		'3. Export unmanaged from a dev environment, then pack **managed** for shared test/prod.',
		'4. Bind connection references and assign security roles (Phases 19–20).',
		'',
		'## PAC / CLI sketches',
		'',
		'Exact `pac` / `pa` verbs vary by CLI version — treat these as checklists:',
		'',
		'```bash',
		`# After publisher + solution exist (unique name ${solution.uniqueName})`,
		`# pac solution export --name ${solution.uniqueName} --path ./dist/${solution.uniqueName}.zip`,
		`# pac solution import --path ./dist/${solution.uniqueName}_managed.zip`,
		'```',
		'',
		'Or use the generated `solution-pack.sh` helper beside this file.',
		'',
		'## Privileges',
		'',
		'Ensuring a publisher requires System Customizer / System Administrator (or equivalent) on the target environment.',
		'',
	].join('\n');
}

/**
 * Renders a shell helper with quoted PAC-oriented commands.
 */
export function renderSolutionPackScript(manifest: AlmManifest): string {
	assertSafeCliToken(manifest.solution.uniqueName, 'solution.uniqueName');
	assertSafeCliToken(manifest.publisher.uniqueName, 'publisher.uniqueName');
	const solution = shellQuote(manifest.solution.uniqueName);
	const org = shellQuote(manifest.dataverseEnvironmentUrl);
	return [
		'#!/usr/bin/env bash',
		'# Generated by pnpm provision / provision:solution — review before running.',
		'# Shared-env happy path: ensure publisher+solution, then export/import via PAC.',
		'set -euo pipefail',
		'',
		`SOLUTION_UNIQUE_NAME=${solution}`,
		`ORG_URL=${org}`,
		'OUT_DIR="${' + 'OUT_DIR:-./dist}"',
		'mkdir -p "$OUT_DIR"',
		'',
		'echo "Publisher unique name: '
		+ `${shellQuote(manifest.publisher.uniqueName)} (prefix ${shellQuote(manifest.publisher.prefix)})"`,
		'echo "Solution: $SOLUTION_UNIQUE_NAME @ '
		+ `${shellQuote(manifest.solution.version)}"`,
		'echo "Org: $ORG_URL"',
		'echo',
		'echo "1) Ensure publisher + solution:"',
		'echo "   DATAVERSE_ACCESS_TOKEN=… pnpm provision:solution"',
		'echo "2) Add schema components to the solution (maker portal, --into-solution apply, or PAC)."',
		'echo "3) Export / import with your installed PAC version, for example:"',
		'echo "   pac solution export --name $SOLUTION_UNIQUE_NAME --path $OUT_DIR/$SOLUTION_UNIQUE_NAME.zip"',
		'echo "   pac solution import --path $OUT_DIR/${'
		+ 'SOLUTION_UNIQUE_NAME}_managed.zip"',
		'',
	].join('\n');
}

function odataHeaders(accessToken: string): Record<string, string> {
	return {
		'Authorization': `Bearer ${accessToken}`,
		'Accept': 'application/json',
		'Content-Type': 'application/json; charset=utf-8',
		'OData-MaxVersion': '4.0',
		'OData-Version': '4.0',
	};
}

/**
 * Lists publishers that already use the given customization prefix.
 */
export async function findPublishersByPrefix(
	apiRoot: string,
	prefix: string,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<PublisherRecord[]> {
	const normalized = prefix.toLowerCase();
	const filter = encodeURIComponent(`customizationprefix eq '${normalized}'`);
	const url
		= `${apiRoot}/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix,customizationoptionvalueprefix`
			+ `&$filter=${filter}`;
	const response = await fetchImpl(url, { headers: odataHeaders(accessToken) });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to query publishers: HTTP ${response.status}: ${text.slice(0, 400)}`);
	}
	const payload = (await response.json()) as { value?: PublisherRecord[] };
	return payload.value ?? [];
}

/**
 * Ensures the profile publisher owns the prefix; creates it when missing.
 * Fails closed on prefix collision with a different uniqueName.
 */
export async function ensurePublisher(
	apiRoot: string,
	profile: ConnectionProfile,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ publisher: PublisherRecord; created: boolean }> {
	const prefix = profile.publisher.prefix.toLowerCase();
	const existing = await findPublishersByPrefix(apiRoot, prefix, accessToken, fetchImpl);
	const match = existing.find(
		(item) => item.uniquename.toLowerCase() === profile.publisher.uniqueName.toLowerCase(),
	);
	if (match) {
		return { publisher: match, created: false };
	}
	const conflict = existing[0];
	if (conflict) {
		throw new PublisherCollisionError(
			prefix,
			conflict.uniquename,
			profile.publisher.uniqueName,
		);
	}

	const optionPrefix
		= profile.publisher.optionValuePrefix ?? DEFAULT_OPTION_VALUE_PREFIX;
	const body = {
		uniquename: profile.publisher.uniqueName,
		friendlyname: profile.publisher.friendlyName,
		customizationprefix: prefix,
		customizationoptionvalueprefix: optionPrefix,
	};
	const response = await fetchImpl(`${apiRoot}/publishers`, {
		method: 'POST',
		headers: {
			...odataHeaders(accessToken),
			Prefer: 'return=representation',
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Failed to create publisher "${profile.publisher.uniqueName}": HTTP ${response.status}: ${text.slice(0, 400)}`,
		);
	}
	const publisher = (await response.json()) as PublisherRecord;
	return { publisher, created: true };
}

/**
 * Finds a solution by unique name.
 */
export async function findSolutionByUniqueName(
	apiRoot: string,
	uniqueName: string,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<SolutionRecord | null> {
	const filter = encodeURIComponent(`uniquename eq '${uniqueName.replace(/'/g, '\'\'')}'`);
	const url
		= `${apiRoot}/solutions?$select=solutionid,uniquename,friendlyname,version&$filter=${filter}`;
	const response = await fetchImpl(url, { headers: odataHeaders(accessToken) });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to query solutions: HTTP ${response.status}: ${text.slice(0, 400)}`);
	}
	const payload = (await response.json()) as { value?: SolutionRecord[] };
	return payload.value?.[0] ?? null;
}

/**
 * Ensures the unmanaged solution exists and is bound to the publisher.
 */
export async function ensureSolution(
	apiRoot: string,
	profile: ConnectionProfile,
	publisherId: string,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ solution: SolutionRecord; created: boolean }> {
	const existing = await findSolutionByUniqueName(
		apiRoot,
		profile.solution.uniqueName,
		accessToken,
		fetchImpl,
	);
	if (existing) {
		return { solution: existing, created: false };
	}

	const body = {
		'uniquename': profile.solution.uniqueName,
		'friendlyname': profile.solution.friendlyName,
		'version': profile.solution.version,
		'publisherid@odata.bind': `/publishers(${publisherId})`,
	};
	const response = await fetchImpl(`${apiRoot}/solutions`, {
		method: 'POST',
		headers: {
			...odataHeaders(accessToken),
			Prefer: 'return=representation',
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Failed to create solution "${profile.solution.uniqueName}": HTTP ${response.status}: ${text.slice(0, 400)}`,
		);
	}
	const solution = (await response.json()) as SolutionRecord;
	return { solution, created: true };
}

/**
 * Ensures publisher ownership then the unmanaged solution (solution-first scaffolding).
 */
export async function ensurePublisherAndSolution(
	apiRoot: string,
	profile: ConnectionProfile,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{
	publisher: PublisherRecord;
	solution: SolutionRecord;
	publisherCreated: boolean;
	solutionCreated: boolean;
}> {
	const publisherResult = await ensurePublisher(apiRoot, profile, accessToken, fetchImpl);
	const solutionResult = await ensureSolution(
		apiRoot,
		profile,
		publisherResult.publisher.publisherid,
		accessToken,
		fetchImpl,
	);
	return {
		publisher: publisherResult.publisher,
		solution: solutionResult.solution,
		publisherCreated: publisherResult.created,
		solutionCreated: solutionResult.created,
	};
}

/**
 * Fetches an entity MetadataId for AddSolutionComponent.
 */
export async function fetchEntityMetadataId(
	apiRoot: string,
	entityLogicalName: string,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const url
		= `${apiRoot}/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=MetadataId`;
	const response = await fetchImpl(url, { headers: odataHeaders(accessToken) });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Failed to read MetadataId for ${entityLogicalName}: HTTP ${response.status}: ${text.slice(0, 400)}`,
		);
	}
	const payload = (await response.json()) as { MetadataId?: string };
	if (!payload.MetadataId) {
		throw new Error(`Entity ${entityLogicalName} response missing MetadataId`);
	}
	return payload.MetadataId;
}

/**
 * Adds an entity component to the named unmanaged solution.
 */
export async function addEntityToSolution(
	apiRoot: string,
	solutionUniqueName: string,
	entityMetadataId: string,
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	const response = await fetchImpl(`${apiRoot}/AddSolutionComponent`, {
		method: 'POST',
		headers: odataHeaders(accessToken),
		body: JSON.stringify({
			ComponentId: entityMetadataId,
			ComponentType: SOLUTION_COMPONENT_ENTITY,
			SolutionUniqueName: solutionUniqueName,
			AddRequiredComponents: false,
			DoNotIncludeSubcomponents: false,
		}),
	});
	if (!response.ok) {
		const text = await response.text();
		const lower = text.toLowerCase();
		// Idempotent when the component is already in the solution.
		if (
			response.status === 409
			|| lower.includes('already')
			|| lower.includes('0x80043b0b')
		) {
			return;
		}
		throw new Error(
			`AddSolutionComponent failed for ${entityMetadataId}: HTTP ${response.status}: ${text.slice(0, 400)}`,
		);
	}
}

/**
 * Adds each planned table entity to the solution (after metadata exists).
 */
export async function addPlanEntitiesToSolution(
	apiRoot: string,
	profile: ConnectionProfile,
	tableLogicalNames: string[],
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ added: string[]; skipped: string[]; failed: Array<{ table: string; error: string }> }> {
	const added: string[] = [];
	const skipped: string[] = [];
	const failed: Array<{ table: string; error: string }> = [];

	for (const table of tableLogicalNames) {
		try {
			const metadataId = await fetchEntityMetadataId(
				apiRoot,
				table,
				accessToken,
				fetchImpl,
			);
			await addEntityToSolution(
				apiRoot,
				profile.solution.uniqueName,
				metadataId,
				accessToken,
				fetchImpl,
			);
			added.push(table);
		}
		catch(error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/already/i.test(message)) {
				skipped.push(table);
				continue;
			}
			failed.push({ table, error: message });
		}
	}

	return { added, skipped, failed };
}

/**
 * True when unmanaged apply is explicitly allowed via CLI flag or profile.
 */
export function isUnmanagedApplyAllowed(
	profile: ConnectionProfile,
	cliUnmanagedOk: boolean,
): boolean {
	return cliUnmanagedOk || Boolean(profile.allowUnmanagedApply);
}
