#!/usr/bin/env node
/**
 * PAC-oriented solution export / pack / import wrappers (no live org required to print commands).
 *
 *   pnpm provision:export
 *   pnpm provision:pack
 *   pnpm provision:import
 *
 * Reads deploy/connections.json (or --example) for solution unique name + org URL.
 * Fails closed when hosts still look like placeholders unless --allow-placeholders.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConnectionProfile } from '../src/provisioning/connection-config.ts';
import { looksLikePlaceholder } from '../src/provisioning/connection-urls.ts';
import { assertSafeCliToken, shellQuote } from '../src/provisioning/shell-quote.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type PackAction = 'export' | 'pack' | 'import';

export interface PackCliArgs {
	action: PackAction;
	useExample: boolean;
	allowPlaceholders: boolean;
	outDir: string;
}

/**
 * Parses pack/export/import CLI args.
 */
export function parsePackArgs(argv: string[]): PackCliArgs {
	const action = (argv.find((arg) =>
		arg === 'export' || arg === 'pack' || arg === 'import',
	) ?? 'pack');
	const outIdx = argv.indexOf('--out');
	return {
		action,
		useExample: argv.includes('--example'),
		allowPlaceholders: argv.includes('--allow-placeholders'),
		outDir: outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : resolve(root, 'dist'),
	};
}

/**
 * Builds documented pac commands for the profile solution.
 */
export function buildPacSolutionCommands(
	action: PackAction,
	solutionUniqueName: string,
	environmentUrl: string,
	outDir: string,
): string[] {
	assertSafeCliToken(solutionUniqueName, 'solution.uniqueName');
	const name = shellQuote(solutionUniqueName);
	const org = shellQuote(environmentUrl);
	const out = shellQuote(outDir);
	const zip = shellQuote(`${outDir}/${solutionUniqueName}.zip`);
	const managed = shellQuote(`${outDir}/${solutionUniqueName}_managed.zip`);

	if (action === 'export') {
		return [
			`# Export unmanaged solution from the connected environment`,
			`pnpm exec pac solution export --name ${name} --path ${zip} --managed false --environment ${org}`,
		];
	}
	if (action === 'import') {
		return [
			`# Import managed solution into the target environment`,
			`pnpm exec pac solution import --path ${managed} --environment ${org}`,
		];
	}
	return [
		`# Pack / convert for managed promotion (CLI verbs vary — review before running)`,
		`mkdir -p ${out}`,
		`echo "1) Export unmanaged from dev: pnpm provision:export"`,
		`echo "2) Open in Solution Packager / pac to produce managed zip at ${managed}"`,
		`echo "3) Import to shared test/prod: pnpm provision:import"`,
		`echo "Bump solution.version in deploy/connections.json before each shared import."`,
	];
}

/**
 * Runs pack/export/import helper (prints commands; does not require pac to be installed).
 */
export function runPackCli(argv: string[]): number {
	const flags = parsePackArgs(argv);
	const connectionsPath = resolve(
		root,
		flags.useExample
			? 'deploy/connections.example.json'
			: 'deploy/connections.json',
	);
	if (!existsSync(connectionsPath)) {
		console.error(`Missing ${connectionsPath}`);
		return 1;
	}
	const profile = loadConnectionProfile(connectionsPath);
	if (
		!flags.allowPlaceholders
		&& (
			looksLikePlaceholder(profile.dataverse.environmentUrl)
			|| looksLikePlaceholder(profile.sharePoint.siteUrl)
			|| looksLikePlaceholder(profile.api.baseUrl)
		)
	) {
		console.error(
			'Refusing pack/export/import while connection profile still has placeholder hosts.\n'
			+ 'Edit deploy/connections.json, or pass --allow-placeholders for local dry-run printing.',
		);
		return 1;
	}

	const generatedSummary = resolve(root, 'deploy/generated/SUMMARY.md');
	if (!existsSync(generatedSummary)) {
		console.warn(
			'warn: deploy/generated/SUMMARY.md missing — run `pnpm provision` first for ALM artifacts.',
		);
	}
	else {
		const summary = readFileSync(generatedSummary, 'utf8');
		if (!summary.includes(profile.solution.uniqueName)) {
			console.warn(
				'warn: generated SUMMARY does not mention this solution uniqueName — regenerate with pnpm provision.',
			);
		}
	}

	const lines = buildPacSolutionCommands(
		flags.action,
		profile.solution.uniqueName,
		profile.dataverse.environmentUrl,
		flags.outDir,
	);
	console.log(`# Document Routing solution ${flags.action}`);
	console.log(`# solution=${profile.solution.uniqueName} version=${profile.solution.version}`);
	console.log(`# Layer: unmanaged (dev) → export → managed pack → import (shared test/prod)`);
	for (const line of lines) {
		console.log(line);
	}
	return 0;
}

const isDirectRun
	= import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
	process.exitCode = runPackCli(process.argv.slice(2));
}
