import type { ConnectionProfile } from './connection-config.ts';
import { describe, expect, it } from 'vitest';
import {
	buildConnectionReferencePlans,
	connectionReferenceCreateBody,
	toConnectorApiId,
} from './connection-references.ts';
import { buildDataverseProvisionPlan } from './dataverse-provision-plan.ts';
import { buildPaConnectCommands } from './pa-connect-commands.ts';

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

describe('connection references', () => {
	it('defaults SharePoint and Dataverse logical names from publisher prefix', () => {
		const plans = buildConnectionReferencePlans(sampleProfile());
		expect(plans.map((item) => item.logicalName)).toEqual([
			'dr_sharepoint',
			'dr_dataverse',
		]);
		expect(plans[0]?.connectorApiId).toBe(
			'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
		);
		expect(connectionReferenceCreateBody(plans[0]).connectionreferencelogicalname)
			.toBe('dr_sharepoint');
	});

	it('honors overrides and can omit Dataverse', () => {
		const plans = buildConnectionReferencePlans(
			sampleProfile({
				connectionReferences: {
					sharePoint: {
						logicalName: 'dr_sp_policies',
						displayName: 'Policies library',
					},
					dataverse: false,
				},
			}),
		);
		expect(plans).toHaveLength(1);
		expect(plans[0]?.logicalName).toBe('dr_sp_policies');
		expect(plans[0]?.displayName).toBe('Policies library');
	});

	it('builds connector API ids from short tokens', () => {
		expect(toConnectorApiId('shared_sharepointonline')).toContain(
			'shared_sharepointonline',
		);
		expect(toConnectorApiId('/providers/Microsoft.PowerApps/apis/x')).toBe(
			'/providers/Microsoft.PowerApps/apis/x',
		);
	});
});

describe('pa-connect bind-to-ref', () => {
	it('emits connection-reference bind guidance by default', () => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const commands = buildPaConnectCommands(profile, plan);
		const script = commands.map((item) => `${item.title}\n${item.command}`).join('\n');
		expect(script).toMatch(/connection reference dr_sharepoint/i);
		expect(script).toMatch(/connection create/);
		expect(script).not.toMatch(/legacy direct path/i);
	});

	it('supports legacyDirectConnection profile flag', () => {
		const profile = sampleProfile({ legacyDirectConnection: true });
		const plan = buildDataverseProvisionPlan(profile);
		const commands = buildPaConnectCommands(profile, plan);
		expect(commands[0]?.title).toMatch(/legacy/i);
	});
});

describe('provision plan connection refs + env vars', () => {
	it('includes connectionreference and environmentvariable requests', () => {
		const plan = buildDataverseProvisionPlan(sampleProfile());
		expect(
			plan.requests.some((item) => item.kind === 'connectionreference'),
		).toBe(true);
		expect(
			plan.requests.some((item) => item.kind === 'environmentvariable'),
		).toBe(true);
		expect(plan.environmentVariableSchemaNames.some((name) => name.startsWith('dr_')))
			.toBe(true);
		expect(plan.connectionReferences.length).toBeGreaterThanOrEqual(1);
	});
});
