#!/usr/bin/env node
/**
 * Provision CLI: generate Dataverse/SharePoint wiring artifacts (and optionally apply).
 *
 *   pnpm provision              # generate from deploy/connections.json
 *   pnpm provision:apply        # apply Web API plan (DATAVERSE_ACCESS_TOKEN)
 *   pnpm provision --example    # generate from connections.example.json
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConnectionProfile } from '../src/provisioning/connection-config.ts';
import {
	applyDataversePlan,
	writeProvisionArtifacts,
} from '../src/provisioning/write-artifacts.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
	const args = new Set(process.argv.slice(2));
	const useExample = args.has('--example');
	const apply = args.has('--apply') || process.env.PROVISION_APPLY === '1';
	const requireHosts = apply || args.has('--strict');

	const connectionsPath = resolve(
		root,
		useExample ? 'deploy/connections.example.json' : 'deploy/connections.json',
	);

	if (!existsSync(connectionsPath)) {
		console.error(
			`Missing ${connectionsPath}\nCopy deploy/connections.example.json → deploy/connections.json and set your real hosts (custom domains OK).`,
		);
		process.exitCode = 1;
		return;
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
		process.exitCode = 1;
		return;
	}

	if (!apply) {
		console.log(
			'\nDry-run only. Set DATAVERSE_ACCESS_TOKEN and run `pnpm provision:apply` to create tables, then run deploy/generated/pa-connect.sh',
		);
		return;
	}

	const token = process.env.DATAVERSE_ACCESS_TOKEN;
	if (!token) {
		console.error('DATAVERSE_ACCESS_TOKEN is required for --apply');
		process.exitCode = 1;
		return;
	}

	const result = await applyDataversePlan(artifacts.plan, token);
	console.log(
		`\nApply finished: ${result.applied} applied, ${result.skipped} skipped, ${result.failed.length} failed`,
	);
	for (const failure of result.failed) {
		console.error(` - ${failure.description}: ${failure.error}`);
	}
	if (result.failed.length > 0) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
