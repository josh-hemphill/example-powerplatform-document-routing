/**
 * Generates prefix-correct Power Automate flow stubs from deploy/flows templates.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FLOW_TEMPLATE_NAMES = [
	'sla-sweeper.json',
	'notify-approval.json',
	'publish-approved.json',
	'on-submit-guard.json',
] as const;

export interface GeneratedFlowArtifact {
	fileName: string;
	contents: string;
}

/**
 * Substitutes the default `dr_` publisher token with the active prefix in a flow stub.
 */
export function applyPrefixToFlowTemplate(
	templateJson: string,
	publisherPrefix: string,
): string {
	const prefix = publisherPrefix.toLowerCase();
	if (prefix === 'dr') {
		return `${ensureTrailingNewline(templateJson)}`;
	}
	// Templates ship with the default `dr_` token; replace as a whole publisher stamp.
	return `${ensureTrailingNewline(templateJson.split('dr_').join(`${prefix}_`))}`;
}

/**
 * Reads flow templates from disk and returns prefix-substituted JSON artifacts.
 */
export function generatePrefixedFlowArtifacts(
	templatesDir: string,
	publisherPrefix: string,
): GeneratedFlowArtifact[] {
	const artifacts: GeneratedFlowArtifact[] = [];
	for (const fileName of FLOW_TEMPLATE_NAMES) {
		const absolute = join(templatesDir, fileName);
		const raw = readFileSync(absolute, 'utf8');
		artifacts.push({
			fileName,
			contents: applyPrefixToFlowTemplate(raw, publisherPrefix),
		});
	}
	return artifacts;
}

/**
 * Lists expected generated flow file names (for validation / CI).
 */
export function expectedFlowArtifactNames(): string[] {
	return [...FLOW_TEMPLATE_NAMES];
}

/**
 * Asserts every planned table logical name appears in generated flow contents when touched by stubs.
 */
export function assertFlowsReferencePrefix(
	artifacts: GeneratedFlowArtifact[],
	publisherPrefix: string,
): string[] {
	const prefix = publisherPrefix.toLowerCase();
	const blob = artifacts.map((item) => item.contents).join('\n');
	const issues: string[] = [];
	if (prefix !== 'dr' && blob.includes('dr_')) {
		issues.push(`Generated flows still contain leftover dr_ for prefix "${prefix}"`);
	}
	const required = [
		`${prefix}_approvalstep`,
		`${prefix}_document`,
		`${prefix}_historyevent`,
	];
	for (const token of required) {
		if (!blob.includes(token)) {
			issues.push(`Generated flows missing expected token ${token}`);
		}
	}
	return issues;
}

/**
 * Ensures templates directory contains the expected stub files.
 */
export function listFlowTemplateFiles(templatesDir: string): string[] {
	return readdirSync(templatesDir).filter((name) => name.endsWith('.json'));
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith('\n') ? value : `${value}\n`;
}
