/**
 * Offline validation for provision artifacts (CI / pack dry-run — no live org).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { looksLikePlaceholder } from '../src/provisioning/connection-urls.ts';
import { expectedFlowArtifactNames } from '../src/provisioning/flow-templates.ts';

export interface ValidateProvisionArtifactsOptions {
	outputDir: string;
	/** When set, fail if leftover `dr_` appears and this prefix is not `dr`. */
	expectedPrefix?: string;
	/** Fail when hosts still look like placeholders (pack gate). */
	rejectPlaceholders?: boolean;
}

/**
 * Validates generated provision artifacts without calling Dataverse.
 */
export function validateProvisionArtifacts(
	options: ValidateProvisionArtifactsOptions,
): string[] {
	const issues: string[] = [];
	const dir = resolve(options.outputDir);
	if (!existsSync(dir)) {
		return [`Missing output directory ${dir}`];
	}

	const required = [
		'SUMMARY.md',
		'alm-manifest.json',
		'connection-references.json',
		'security-roles.json',
		'environment-variable-values.md',
		'solution-pack.md',
	];
	for (const name of required) {
		if (!existsSync(join(dir, name))) {
			issues.push(`Missing required artifact ${name}`);
		}
	}

	const flowsDir = join(dir, 'flows');
	if (!existsSync(flowsDir)) {
		issues.push('Missing generated flows/ directory');
	}
	else {
		for (const name of expectedFlowArtifactNames()) {
			if (!existsSync(join(flowsDir, name))) {
				issues.push(`Missing generated flow ${name}`);
			}
		}
	}

	if (existsSync(join(dir, 'alm-manifest.json'))) {
		const manifest = JSON.parse(readFileSync(join(dir, 'alm-manifest.json'), 'utf8')) as {
			publisher?: { prefix?: string };
			securityRoles?: Array<{ displayName?: string }>;
		};
		if (options.expectedPrefix && manifest.publisher?.prefix !== options.expectedPrefix) {
			issues.push(
				`alm-manifest prefix ${manifest.publisher?.prefix} !== expected ${options.expectedPrefix}`,
			);
		}
		if (!manifest.securityRoles?.length) {
			issues.push('alm-manifest missing securityRoles');
		}

		const prefix = options.expectedPrefix ?? manifest.publisher?.prefix;
		if (prefix && prefix !== 'dr' && existsSync(flowsDir)) {
			const flowBlob = expectedFlowArtifactNames()
				.map((name) => {
					const path = join(flowsDir, name);
					return existsSync(path) ? readFileSync(path, 'utf8') : '';
				})
				.join('\n');
			if (flowBlob.includes('dr_')) {
				issues.push(`Generated flows still contain dr_ for prefix ${prefix}`);
			}
			if (!flowBlob.includes(`${prefix}_document`)) {
				issues.push(`Generated flows missing ${prefix}_document`);
			}
		}
	}

	if (options.rejectPlaceholders && existsSync(join(dir, 'app.env.example'))) {
		const envExample = readFileSync(join(dir, 'app.env.example'), 'utf8');
		for (const line of envExample.split('\n')) {
			if (!line.includes('=')) {
				continue;
			}
			const value = line.slice(line.indexOf('=') + 1).trim();
			if (value && looksLikePlaceholder(value)) {
				issues.push(`Placeholder host in app.env.example: ${line}`);
			}
		}
	}

	return issues;
}

const isDirectRun
	= import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const outDir = resolve(root, process.argv[2] ?? 'deploy/generated');
	const prefixIdx = process.argv.indexOf('--prefix');
	const expectedPrefix = prefixIdx >= 0 ? process.argv[prefixIdx + 1] : undefined;
	const rejectPlaceholders = process.argv.includes('--reject-placeholders');
	const issues = validateProvisionArtifacts({
		outputDir: outDir,
		expectedPrefix,
		rejectPlaceholders,
	});
	if (issues.length > 0) {
		for (const issue of issues) {
			console.error(`error: ${issue}`);
		}
		process.exitCode = 1;
	}
	else {
		console.log(`Validated provision artifacts under ${outDir}`);
	}
}
