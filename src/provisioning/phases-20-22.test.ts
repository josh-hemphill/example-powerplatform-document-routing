import type { ConnectionProfile } from './connection-config.ts';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATAVERSE_SECURITY_ROLE_NAMES } from '../domain/security-roles.ts';
import {
	assertFlowsReferencePrefix,
	generatePrefixedFlowArtifacts,
} from './flow-templates.ts';
import {
	buildSecurityRolePlans,
	securityRoleDisplayNames,
} from './security-roles-plan.ts';
import { writeProvisionArtifacts } from './write-artifacts.ts';

function sampleProfile(
	overrides: Partial<ConnectionProfile> = {},
): ConnectionProfile {
	return {
		publisher: {
			uniqueName: 'docrouting',
			friendlyName: 'Document Routing',
			prefix: 'dr',
			optionValuePrefix: 72700,
		},
		solution: {
			uniqueName: 'DocumentRouting',
			friendlyName: 'Document Routing',
			version: '1.0.0.0',
		},
		powerPlatform: {
			environmentId: '11111111-2222-3333-4444-555555555555',
			cloud: 'public',
		},
		dataverse: {
			environmentUrl: 'https://data.fabrikam.internal',
			apiVersion: 'v9.2',
		},
		sharePoint: {
			siteUrl: 'https://docs.fabrikam.internal/sites/Policies',
			libraryName: 'Published Documents',
			folderPath: '/Policies',
			connectorId: 'shared_sharepointonline',
		},
		api: {
			baseUrl: 'https://api.fabrikam.internal/document-routing',
		},
		...overrides,
	};
}

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

describe('security role plans', () => {
	it('keeps stable display names and prefixes table logical names', () => {
		const plans = buildSecurityRolePlans('acme');
		expect(securityRoleDisplayNames()).toEqual(Object.values(DATAVERSE_SECURITY_ROLE_NAMES));
		expect(plans.map((role) => role.displayName)).toEqual(
			Object.values(DATAVERSE_SECURITY_ROLE_NAMES),
		);
		const userDoc = plans
			.find((role) => role.token === 'user')
			?.tables
			.find((table) => table.schemaName === 'document');
		expect(userDoc?.logicalName).toBe('acme_document');
	});
});

describe('flow prefix generation', () => {
	it('substitutes acme_ and drops leftover dr_', () => {
		const artifacts = generatePrefixedFlowArtifacts('deploy/flows', 'acme');
		expect(assertFlowsReferencePrefix(artifacts, 'acme')).toEqual([]);
		expect(artifacts.some((item) => item.contents.includes('acme_approvalsteps'))).toBe(
			true,
		);
		expect(artifacts.some((item) => item.contents.includes('dr_'))).toBe(false);
	});
});

describe('phases 20–22 provision artifacts', () => {
	it('writes roles, flows, and shared-env-safe seed for acme prefix', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-acme-'));
		tempDirs.push(dir);
		const result = writeProvisionArtifacts(
			sampleProfile({
				publisher: {
					uniqueName: 'acmerouting',
					friendlyName: 'Acme Routing',
					prefix: 'acme',
					optionValuePrefix: 72700,
				},
			}),
			dir,
		);
		expect(result.validationErrors).toHaveLength(0);
		expect(result.almManifest?.securityRoles[0]?.displayName).toBe(
			DATAVERSE_SECURITY_ROLE_NAMES.user,
		);
		const summary = readFileSync(join(dir, 'SUMMARY.md'), 'utf8');
		expect(summary).toContain('acme');
		expect(summary).toContain('Document Routing Admin');
		expect(summary).toMatch(/Demo control seed identities: `false`/);
		const roles = JSON.parse(readFileSync(join(dir, 'security-roles.json'), 'utf8')) as Array<{
			tables: Array<{ logicalName: string }>;
		}>;
		expect(roles[0]?.tables.some((table) => table.logicalName.startsWith('acme_'))).toBe(
			true,
		);
		const flow = readFileSync(join(dir, 'flows/sla-sweeper.json'), 'utf8');
		expect(flow).toContain('acme_approvalstep');
		expect(flow).not.toContain('dr_');
		const seed = JSON.parse(readFileSync(join(dir, 'control-seed.json'), 'utf8')) as {
			sampleIdentityEmails: string[];
		};
		expect(seed.sampleIdentityEmails).toEqual([]);
	});

	it('includes Contoso identities only with includeDemoIdentities', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-demo-'));
		tempDirs.push(dir);
		writeProvisionArtifacts(sampleProfile(), dir, { includeDemoIdentities: true });
		const seed = JSON.parse(readFileSync(join(dir, 'control-seed.json'), 'utf8')) as {
			sampleIdentityEmails: string[];
		};
		expect(seed.sampleIdentityEmails.length).toBeGreaterThan(0);
	});
});
