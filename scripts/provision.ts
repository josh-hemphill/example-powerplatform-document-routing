#!/usr/bin/env node
/**
 * Provision CLI: generate Dataverse/SharePoint wiring artifacts (and optionally apply).
 *
 *   pnpm provision                 # generate from deploy/connections.json
 *   pnpm provision:example         # generate from connections.example.json
 *   pnpm provision:solution        # generate + ensure publisher/solution (token)
 *   pnpm provision:apply -- --unmanaged-ok     # scratch unmanaged apply
 *   pnpm provision:apply -- --into-solution    # apply + add tables to solution
 *
 * Env: DATAVERSE_ACCESS_TOKEN (required for apply / live solution ensure)
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConnectionProfile } from '../src/provisioning/connection-config.ts';
import {
	addPlanConnectionReferencesToSolution,
	addPlanEntitiesToSolution,
	addPlanEnvironmentVariablesToSolution,
	ensurePublisherAndSolution,
	isUnmanagedApplyAllowed,
	PublisherCollisionError,
	SolutionOwnershipError,
} from '../src/provisioning/solution-alm.ts';
import {
	applyDataversePlan,
	writeProvisionArtifacts,
} from '../src/provisioning/write-artifacts.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface ProvisionCliArgs {
	useExample: boolean;
	apply: boolean;
	solution: boolean;
	intoSolution: boolean;
	unmanagedOk: boolean;
	strict: boolean;
}

/**
 * Parses provision CLI flags from argv (excluding node + script path).
 */
export function parseProvisionArgs(argv: string[]): ProvisionCliArgs {
	const args = new Set(argv);
	return {
		useExample: args.has('--example'),
		apply: args.has('--apply') || process.env.PROVISION_APPLY === '1',
		solution: args.has('--solution'),
		intoSolution: args.has('--into-solution'),
		unmanagedOk: args.has('--unmanaged-ok'),
		strict: args.has('--strict'),
	};
}

/**
 * Runs provision generate / solution ensure / optional Web API apply.
 */
export async function runProvision(argv: string[]): Promise<number> {
	const flags = parseProvisionArgs(argv);
	const requireHosts
		= flags.apply || flags.intoSolution || flags.solution || flags.strict;

	const connectionsPath = resolve(
		root,
		flags.useExample
			? 'deploy/connections.example.json'
			: 'deploy/connections.json',
	);

	if (!existsSync(connectionsPath)) {
		console.error(
			`Missing ${connectionsPath}\n`
			+ 'Copy deploy/connections.example.json → deploy/connections.json '
			+ 'and set your real hosts (custom domains OK).',
		);
		return 1;
	}

	const profile = loadConnectionProfile(connectionsPath);
	const outputDir = resolve(root, 'deploy/generated');
	const artifacts = writeProvisionArtifacts(profile, outputDir, {
		requireDeployableHosts: requireHosts,
	});

	for (const warning of artifacts.validationWarnings) {
		console.warn(`warn: ${warning}`);
	}
	for (const error of artifacts.validationErrors) {
		console.error(`error: ${error}`);
	}

	console.log(`Wrote ${artifacts.files.length} files under ${outputDir}`);
	for (const file of artifacts.files) {
		console.log(` - ${file}`);
	}

	if (artifacts.validationErrors.length > 0) {
		return 1;
	}

	const token = process.env.DATAVERSE_ACCESS_TOKEN?.trim();
	const shouldEnsureSolution = flags.solution || flags.intoSolution;

	if (flags.solution && !token) {
		console.error(
			'DATAVERSE_ACCESS_TOKEN is required for `pnpm provision:solution` '
			+ '(live publisher + solution ensure).',
		);
		console.error(
			`Artifacts were written under ${outputDir}; review solution-pack.md, then retry with a token.`,
		);
		return 1;
	}

	if (flags.intoSolution && !flags.apply && !token) {
		console.log(
			'Solution ensure skipped (set DATAVERSE_ACCESS_TOKEN for live publisher/solution ensure).',
		);
		console.log(
			`Review ${resolve(outputDir, 'solution-pack.md')} and ${resolve(outputDir, 'alm-manifest.json')}.`,
		);
	}

	if (shouldEnsureSolution && token) {
		try {
			const ensured = await ensurePublisherAndSolution(
				artifacts.plan.apiRoot,
				profile,
				token,
			);
			console.log(
				`Publisher: ${ensured.publisher.uniquename} `
				+ `(${ensured.publisherCreated ? 'created' : 'existing'})`,
			);
			console.log(
				`Solution: ${ensured.solution.uniquename} `
				+ `(${ensured.solutionCreated ? 'created' : 'existing'})`,
			);
		}
		catch(error) {
			if (
				error instanceof PublisherCollisionError
				|| error instanceof SolutionOwnershipError
			) {
				console.error(error.message);
				return 1;
			}
			throw error;
		}
	}

	if (!flags.apply) {
		if (!flags.solution) {
			console.log(
				'\nDry-run only. Prefer `pnpm provision:solution` for shared environments, '
				+ 'or `pnpm provision:apply -- --unmanaged-ok` / `--into-solution` for scratch apply.',
			);
		}
		return 0;
	}

	const allowApply
		= flags.intoSolution
			|| isUnmanagedApplyAllowed(profile, flags.unmanagedOk);
	if (!allowApply) {
		console.error(
			'Refusing unmanaged Web API apply against a shared environment.\n'
			+ 'Use one of:\n'
			+ '  pnpm provision:solution\n'
			+ '  pnpm provision:apply -- --into-solution\n'
			+ '  pnpm provision:apply -- --unmanaged-ok\n'
			+ 'Or set allowUnmanagedApply: true on the connection profile (local/scratch only).',
		);
		return 1;
	}

	if (flags.unmanagedOk && !flags.intoSolution) {
		console.warn(
			'WARNING: Applying schema unmanaged (not solution-aware). '
			+ 'Prefer --into-solution or provision:solution for shared environments.',
		);
	}

	if (!token) {
		console.error('DATAVERSE_ACCESS_TOKEN is required for --apply');
		return 1;
	}

	// Collision gate before unmanaged apply as well (shared-org safety).
	if (!shouldEnsureSolution) {
		try {
			await ensurePublisherAndSolution(
				artifacts.plan.apiRoot,
				profile,
				token,
			);
		}
		catch(error) {
			if (
				error instanceof PublisherCollisionError
				|| error instanceof SolutionOwnershipError
			) {
				console.error(error.message);
				return 1;
			}
			throw error;
		}
	}

	console.log(`Applying plan to ${artifacts.plan.apiRoot} …`);
	const result = await applyDataversePlan(artifacts.plan, token, {
		solutionUniqueName: flags.intoSolution
			? profile.solution.uniqueName
			: undefined,
	});
	console.log(
		`Apply finished: ${result.applied} applied, ${result.skipped} skipped, `
		+ `${result.failed.length} failed`,
	);
	for (const failure of result.failed) {
		console.error(` - ${failure.description}: ${failure.error}`);
	}
	if (result.failed.length > 0) {
		return 1;
	}

	if (flags.intoSolution) {
		const addResult = await addPlanEntitiesToSolution(
			artifacts.plan.apiRoot,
			profile,
			artifacts.plan.tableLogicalNames,
			token,
		);
		console.log(
			`Solution tables: added ${addResult.added.length}, `
			+ `skipped ${addResult.skipped.length}, failed ${addResult.failed.length}`,
		);
		for (const failure of addResult.failed) {
			console.error(` - FAIL add ${failure.table}: ${failure.error}`);
		}
		if (addResult.failed.length > 0) {
			return 1;
		}

		const envResult = await addPlanEnvironmentVariablesToSolution(
			artifacts.plan.apiRoot,
			profile,
			artifacts.plan.environmentVariableSchemaNames,
			token,
		);
		console.log(
			`Solution env vars: added ${envResult.added.length}, failed ${envResult.failed.length}`,
		);
		for (const failure of envResult.failed) {
			console.error(` - FAIL add ${failure.schemaName}: ${failure.error}`);
		}
		if (envResult.failed.length > 0) {
			return 1;
		}

		const refResult = await addPlanConnectionReferencesToSolution(
			artifacts.plan.apiRoot,
			profile,
			artifacts.plan.connectionReferences.map((item) => item.logicalName),
			token,
		);
		console.log(
			`Solution connection refs: added ${refResult.added.length}, failed ${refResult.failed.length}`,
		);
		for (const failure of refResult.failed) {
			console.error(` - FAIL add ${failure.logicalName}: ${failure.error}`);
		}
		if (refResult.failed.length > 0) {
			return 1;
		}
	}

	return 0;
}

const isDirectRun
	= import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
	runProvision(process.argv.slice(2))
		.then((code) => {
			process.exitCode = code;
		})
		.catch((error: unknown) => {
			console.error(error instanceof Error ? error.message : error);
			process.exitCode = 1;
		});
}
