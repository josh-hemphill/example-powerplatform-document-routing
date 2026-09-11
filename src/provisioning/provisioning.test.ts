import type { ConnectionProfile } from './connection-config.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {

	loadConnectionProfile,
	validateAgainstJsonSchema,
	validateConnectionProfile,
} from './connection-config.ts';
import {
	assertDeployableEndpoint,
	dataverseWebApiRoot,
	isPlaceholderHost,
	looksLikePlaceholder,
	parseEndpointUrl,
} from './connection-urls.ts';
import {
	buildControlSeedBundle,
	controlSeedHasSampleIdentities,
} from './control-seed.ts';
import {
	buildDataverseProvisionPlan,
	relationshipDefinitionPayload,
} from './dataverse-provision-plan.ts';
import {
	buildDataverseSchema,
	DOCUMENT_TITLE_MAX_LENGTH,
} from './dataverse-schema.ts';
import { buildPaConnectCommands } from './pa-connect-commands.ts';
import { assertSafeCliToken, shellQuote } from './shell-quote.ts';
import {
	applyDataversePlan,
	isDocumentedDuplicate,
	writeProvisionArtifacts,
} from './write-artifacts.ts';

function sampleProfile(): ConnectionProfile {
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

describe('connection URLs', () => {
	it('accepts custom / vanity hosts (not only Microsoft primary domains)', () => {
		expect(parseEndpointUrl('https://docs.fabrikam.internal/sites/X', 'site').host).toBe(
			'docs.fabrikam.internal',
		);
		expect(
			parseEndpointUrl('https://dataverse.contoso-corp.net', 'org').host,
		).toBe('dataverse.contoso-corp.net');
		expect(dataverseWebApiRoot('https://org.crm.dynamics.com/')).toBe(
			'https://org.crm.dynamics.com/api/data/v9.2',
		);
		expect(dataverseWebApiRoot('https://data.fabrikam.internal')).toBe(
			'https://data.fabrikam.internal/api/data/v9.2',
		);
	});

	it('builds Web API root from origin and rejects org URLs with a path', () => {
		expect(() =>
			dataverseWebApiRoot('https://data.fabrikam.internal/foo'),
		).toThrow(/without a path/);
	});

	it('requires https for deployable endpoints', () => {
		expect(() =>
			assertDeployableEndpoint('http://docs.fabrikam.internal/sites/X', 'sharePoint.siteUrl'),
		).toThrow(/must use https/);
	});

	it('flags documentation placeholders without requiring *.sharepoint.com', () => {
		expect(isPlaceholderHost('docs.example.com')).toBe(true);
		expect(isPlaceholderHost('docs.fabrikam.internal')).toBe(false);
		expect(looksLikePlaceholder('https://REPLACE_ME.dataverse.example.com')).toBe(
			true,
		);
		expect(() =>
			assertDeployableEndpoint(
				'https://docs.example.com/sites/Policies',
				'sharePoint.siteUrl',
			),
		).toThrow(/placeholder host/);
	});
});

describe('connection profile validation', () => {
	it('allows custom domains when strict', () => {
		const issues = validateConnectionProfile(sampleProfile(), {
			requireDeployableHosts: true,
		});
		expect(issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
	});

	it('errors on example placeholder hosts when strict', () => {
		const profile = sampleProfile();
		profile.sharePoint.siteUrl = 'https://docs.example.com/sites/Policies';
		const issues = validateConnectionProfile(profile, {
			requireDeployableHosts: true,
		});
		expect(issues.some((issue) => issue.field === 'sharePoint.siteUrl')).toBe(true);
	});

	it('rejects unknown properties via JSON Schema', () => {
		const issues = validateAgainstJsonSchema({
			...sampleProfile(),
			extraEvil: true,
		});
		expect(issues.some((issue) => issue.message.includes('must NOT have additional properties'))).toBe(
			true,
		);
	});

	it('loadConnectionProfile throws on schema-invalid JSON', () => {
		const dir = mkdtempSync(join(tmpdir(), 'conn-'));
		tempDirs.push(dir);
		const path = join(dir, 'bad.json');
		writeFileSync(path, JSON.stringify({ publisher: { prefix: 'dr' } }));
		expect(() => loadConnectionProfile(path)).toThrow(/Invalid connection profile/);
	});
});

describe('shell quoting', () => {
	it('pOSIX-quotes values with spaces and embedded quotes', () => {
		expect(shellQuote(`Policies "Q1"`)).toBe(`'Policies "Q1"'`);
		expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
	});

	it('rejects unsafe connector tokens', () => {
		expect(() => assertSafeCliToken('shared;rm -rf', 'connector')).toThrow(/must match/);
	});
});

describe('dataverse schema + provision plan', () => {
	it('includes control tables and SLA/revision fields', () => {
		const schema = buildDataverseSchema('dr');
		expect(schema.tables.map((table) => table.schemaName)).toEqual([
			'publishdestination',
			'approverpool',
			'approverpoolmember',
			'documenttype',
			'approvalchainstep',
			'appsetting',
			'document',
			'approvalstep',
			'historyevent',
			'prioritylevel',
			'documentsubtype',
			'reviewcomment',
		]);
		const document = schema.tables.find((table) => table.schemaName === 'document')!;
		expect(document.columns.some((column) => column.schemaName === 'contentrevision')).toBe(
			true,
		);
		expect(document.columns.some((column) => column.schemaName === 'documentnumber')).toBe(
			true,
		);
		expect(document.columns.some((column) => column.schemaName === 'supersedesdocument')).toBe(
			true,
		);
		const typeTable = schema.tables.find((table) => table.schemaName === 'documenttype');
		expect(typeTable?.columns.some((column) => column.schemaName === 'numberprefix')).toBe(
			true,
		);
		expect(typeTable?.columns.some((column) => column.schemaName === 'nextsequence')).toBe(
			true,
		);
		expect(typeTable?.columns.some((column) => column.schemaName === 'createworkflow')).toBe(
			true,
		);
		expect(
			typeTable?.columns.some((column) => column.schemaName === 'requestfieldsjson'),
		).toBe(true);
		expect(
			document.columns.some((column) => column.schemaName === 'typefieldvaluesjson'),
		).toBe(true);
		expect(
			document.columns.some((column) => column.schemaName === 'allowreviewerdraftedit'),
		).toBe(true);
		const createWorkflow = typeTable?.columns.find(
			(column) => column.schemaName === 'createworkflow',
		);
		expect(createWorkflow?.type).toBe('choice');
		expect(createWorkflow?.options?.map((option) => option.label)).toEqual([
			'standard',
			'dispatch_to_review',
		]);
		expect(document.columns.some((column) => column.schemaName === 'publishdestination')).toBe(
			true,
		);
		expect(
			document.columns.find((column) => column.schemaName === 'title')?.maxLength,
		).toBe(DOCUMENT_TITLE_MAX_LENGTH);

		const step = schema.tables.find((table) => table.schemaName === 'approvalstep')!;
		expect(step.columns.some((column) => column.schemaName === 'activatedueat')).toBe(true);
		expect(step.columns.some((column) => column.schemaName === 'elevationsemantics')).toBe(
			true,
		);
		expect(step.columns.some((column) => column.schemaName === 'authoritylevel')).toBe(true);
		expect(document.columns.some((column) => column.schemaName === 'priorityreason')).toBe(
			true,
		);
		expect(schema.tables.some((table) => table.schemaName === 'reviewcomment')).toBe(true);
	});

	it('uses publisher optionValuePrefix for choice option values', () => {
		const schema = buildDataverseSchema('dr', 81_200);
		const document = schema.tables.find((table) => table.schemaName === 'document')!;
		const status = document.columns.find((column) => column.schemaName === 'status');
		expect(status?.options?.[0]).toEqual({ value: 812_000_000, label: 'requested' });
		expect(status?.options?.[2]).toEqual({ value: 812_000_002, label: 'in_review' });
	});

	it('builds lookup relationships via RelationshipDefinitions', () => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const relationship = plan.requests.find(
			(request) =>
				request.kind === 'relationship'
				&& request.path === '/RelationshipDefinitions'
				&& String((request.body as { SchemaName?: string }).SchemaName).includes(
					'document_publishdestination',
				),
		);
		expect(relationship).toBeTruthy();
		expect(relationship?.body).toMatchObject({
			'@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
			'Lookup': {
				'@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
			},
		});

		const schema = buildDataverseSchema('dr');
		const document = schema.tables.find((table) => table.schemaName === 'document')!;
		const column = document.columns.find((item) => item.schemaName === 'publishdestination')!;
		const payload = relationshipDefinitionPayload('dr', document, column);
		expect(payload.ReferencingEntity).toBe('dr_document');
		expect(payload.ReferencedEntity).toBe('dr_publishdestination');
	});

	it('builds web api plan and shell-quoted pa commands using profile hosts', () => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		expect(plan.apiRoot).toBe('https://data.fabrikam.internal/api/data/v9.2');
		expect(plan.tableLogicalNames).toContain('dr_document');
		expect(plan.tableLogicalNames).toContain('dr_documenttype');
		expect(plan.requests.some((request) =>
			request.kind === 'attribute'
			&& String((request.body as { SchemaName?: string }).SchemaName ?? '')
				.toLowerCase()
				.endsWith('_createworkflow'),
		)).toBe(true);
		expect(plan.requests.some((request) =>
			request.kind === 'attribute'
			&& String((request.body as { SchemaName?: string }).SchemaName ?? '')
				.toLowerCase()
				.endsWith('_requestfieldsjson'),
		)).toBe(true);
		expect(plan.requests.some((request) =>
			request.kind === 'attribute'
			&& String((request.body as { SchemaName?: string }).SchemaName ?? '')
				.toLowerCase()
				.endsWith('_typefieldvaluesjson'),
		)).toBe(true);
		expect(plan.requests.some((request) =>
			request.kind === 'attribute'
			&& String((request.body as { SchemaName?: string }).SchemaName ?? '')
				.toLowerCase()
				.endsWith('_allowreviewerdraftedit'),
		)).toBe(true);
		expect(plan.requests.some((request) => request.path === '/EntityDefinitions')).toBe(
			true,
		);
		expect(plan.environmentVariableDefaults.dr_SharePointSiteUrl).toBe(
			profile.sharePoint.siteUrl,
		);

		const commands = buildPaConnectCommands(profile, plan);
		const sharePoint = commands.find((item) =>
			item.command.includes('--dataset '),
		);
		expect(sharePoint?.command).toContain(
			`--dataset ${shellQuote('https://docs.fabrikam.internal/sites/Policies')}`,
		);
		expect(sharePoint?.command).not.toContain('sharepoint.com');

		const dataverse = commands.find((item) => item.command.includes('--table dr_document'));
		expect(dataverse?.command).toContain(
			`--org-url ${shellQuote('https://data.fabrikam.internal')}`,
		);
	});
});

describe('writeProvisionArtifacts', () => {
	it('does not write executable artifacts when validation fails', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-'));
		tempDirs.push(dir);
		const profile = sampleProfile();
		profile.sharePoint.connectorId = 'bad;token';
		const result = writeProvisionArtifacts(profile, dir);
		expect(result.validationErrors.length).toBeGreaterThan(0);
		expect(result.files).toHaveLength(0);
		expect(result.plan.requests).toHaveLength(0);
		expect(() => readFileSync(join(dir, 'pa-connect.sh'), 'utf8')).toThrow();
	});

	it('returns validation errors without throwing on an invalid Dataverse URL', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-bad-url-'));
		tempDirs.push(dir);
		const profile = sampleProfile();
		profile.dataverse.environmentUrl = 'not-a-url';
		expect(() => writeProvisionArtifacts(profile, dir)).not.toThrow();
		const result = writeProvisionArtifacts(profile, dir);
		expect(result.validationErrors.some((item) => item.includes('dataverse.environmentUrl'))).toBe(
			true,
		);
		expect(result.files).toHaveLength(0);
		expect(result.plan.tableLogicalNames).toHaveLength(0);
	});

	it('emits boolean attributes with top-level DefaultValue only', () => {
		const plan = buildDataverseProvisionPlan(sampleProfile());
		const booleanAttribute = plan.requests
			.filter((request) => request.kind === 'attribute')
			.map((request) => request.body as Record<string, unknown>)
			.find((body) => body['@odata.type'] === 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata');
		expect(booleanAttribute).toBeTruthy();
		expect(booleanAttribute?.DefaultValue).toBe(false);
		const optionSet = booleanAttribute?.OptionSet as Record<string, unknown>;
		expect(optionSet.DefaultValue).toBeUndefined();
		expect(optionSet.TrueOption).toBeTruthy();
		expect(optionSet.FalseOption).toBeTruthy();
	});

	it('writes control seed and plan when valid', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-ok-'));
		tempDirs.push(dir);
		const result = writeProvisionArtifacts(sampleProfile(), dir);
		expect(result.validationErrors).toHaveLength(0);
		expect(result.files.some((file) => file.endsWith('control-seed.json'))).toBe(true);
		const seed = JSON.parse(readFileSync(join(dir, 'control-seed.json'), 'utf8'));
		expect(seed.documentTypes.length).toBeGreaterThan(0);
		expect(seed.sampleIdentityEmails).toEqual([]);
	});

	it('writes demo identities when includeDemoIdentities is set', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-demo-seed-'));
		tempDirs.push(dir);
		writeProvisionArtifacts(sampleProfile(), dir, { includeDemoIdentities: true });
		const seed = JSON.parse(readFileSync(join(dir, 'control-seed.json'), 'utf8'));
		expect(seed.sampleIdentityEmails.length).toBeGreaterThan(0);
	});

	it('writes ALM manifest, solution pack guides, and publisher uniqueName in SUMMARY', () => {
		const dir = mkdtempSync(join(tmpdir(), 'prov-alm-'));
		tempDirs.push(dir);
		const result = writeProvisionArtifacts(sampleProfile(), dir);
		expect(result.validationErrors).toHaveLength(0);
		expect(result.almManifest?.publisher.uniqueName).toBe('docrouting');
		expect(result.almManifest?.solution.uniqueName).toBe('DocumentRouting');
		expect(result.files.some((file) => file.endsWith('alm-manifest.json'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('solution-pack.md'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('solution-pack.sh'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('connection-references.json'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('environment-variable-values.md'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('security-roles.json'))).toBe(true);
		expect(result.files.some((file) => file.includes(`${join('flows', 'sla-sweeper.json')}`) || file.endsWith('flows/sla-sweeper.json'))).toBe(true);
		const summary = readFileSync(join(dir, 'SUMMARY.md'), 'utf8');
		expect(summary).toContain('docrouting');
		expect(summary).toContain('DocumentRouting');
		expect(summary).toContain('pnpm provision:solution');
		expect(summary).toContain('dr_sharepoint');
		expect(summary).toContain('Document Routing Admin');
		expect(summary).toMatch(/connection reference/i);
		expect(summary).not.toMatch(/connection references arrive in Phase 19/i);
		const manifest = JSON.parse(readFileSync(join(dir, 'alm-manifest.json'), 'utf8'));
		expect(manifest.publisher.uniqueName).toBe('docrouting');
		expect(manifest.preferredPath).toBe('solution');
		expect(manifest.connectionReferences[0].logicalName).toBe('dr_sharepoint');
		const paConnect = readFileSync(join(dir, 'pa-connect.sh'), 'utf8');
		expect(paConnect).toMatch(/connection reference/i);
	});
});

describe('control seed', () => {
	it('flags Contoso sample identities when demo seed is requested', () => {
		const seed = buildControlSeedBundle('dr', undefined, { includeDemoIdentities: true });
		expect(controlSeedHasSampleIdentities(seed)).toBe(true);
		expect(seed.appSettings.some((item) => item.key === 'allowApproverOverride')).toBe(
			true,
		);
	});

	it('omits Contoso identities by default for shared-env safety', () => {
		const seed = buildControlSeedBundle('dr');
		expect(controlSeedHasSampleIdentities(seed)).toBe(false);
		expect(seed.sampleIdentityEmails).toEqual([]);
		expect(seed.priorityLevels.some((row) => row.key === 'mission_critical')).toBe(true);
		expect(seed.documentSubtypes.some((row) => row.key === 'hr' && row.documentTypeId === 'policy')).toBe(
			true,
		);
		expect(seed.documentTypes.find((type) => type.id === 'policy')?.chain.some(
			(step) => step.authorityLevel === 'authoritative',
		)).toBe(true);
		expect(seed.documentTypes.find((type) => type.id === 'ilar')?.chain.map(
			(step) => step.role,
		)).toEqual([
			'Engineering Manager',
			'Lead Engineers',
			'Assigned Engineers',
		]);
		const ilar = seed.documentTypes.find((type) => type.id === 'ilar');
		expect(ilar?.createWorkflow).toBe('dispatch_to_review');
		expect(ilar?.requestFields.map((field) => field.key)).toEqual(['relevantSystems']);
		expect(seed.documentTypes.find((type) => type.id === 'policy')?.createWorkflow).toBe(
			'standard',
		);
	});
});

describe('applyDataversePlan', () => {
	it('does not treat HTTP 404 as skipped when creating entities', async() => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const createOnly = {
			...plan,
			requests: plan.requests.filter((request) => request.kind === 'entity').slice(0, 1),
		};

		const result = await applyDataversePlan(
			createOnly,
			'token',
			async() =>
				new Response('{"error":{"message":"Not Found"}}', {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				}),
		);

		expect(result.applied).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.error).toMatch(/HTTP 404/);
	});

	it('recognizes documented duplicate conditions only', () => {
		expect(isDocumentedDuplicate(409, 'conflict')).toBe(true);
		expect(isDocumentedDuplicate(400, '0x80044328 Attribute')).toBe(true);
		expect(isDocumentedDuplicate(400, 'something went wrong')).toBe(false);
		expect(isDocumentedDuplicate(404, 'Not Found')).toBe(false);
	});

	it('fails apply when an existing attribute has an incompatible type', async() => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const attributeRequest = plan.requests.find(
			(request) =>
				request.kind === 'attribute'
				&& String((request.body as { SchemaName?: string }).SchemaName ?? '')
					.toLowerCase()
					.includes('title'),
		);
		expect(attributeRequest).toBeTruthy();

		const entityLogical = attributeRequest!.entityLogicalName!;
		const result = await applyDataversePlan(
			{
				...plan,
				requests: [
					{
						...plan.requests.find((request) => request.entityLogicalName === entityLogical && request.kind === 'entity')!,
						skipIfExists: true,
					},
					attributeRequest!,
				],
			},
			'token',
			async(url) => {
				if (String(url).includes('/Attributes(')) {
					return new Response(
						JSON.stringify({
							LogicalName: 'dr_title',
							AttributeType: 'Integer',
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } },
					);
				}
				if (String(url).includes('EntityDefinitions')) {
					return new Response(
						JSON.stringify({ LogicalName: entityLogical }),
						{ status: 200, headers: { 'Content-Type': 'application/json' } },
					);
				}
				return new Response('{}', { status: 204 });
			},
		);

		expect(result.failed.length).toBeGreaterThan(0);
		expect(result.failed.some((item) => /expects string|Integer/i.test(item.error))).toBe(true);
	});

	it('skips existing environment variables via GET-before-POST', async() => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const envRequest = plan.requests.find((request) => request.kind === 'environmentvariable');
		expect(envRequest).toBeTruthy();
		const schemaName = String(
			(envRequest!.body as { schemaname?: string }).schemaname ?? '',
		);

		const result = await applyDataversePlan(
			{ ...plan, requests: [envRequest!] },
			'token',
			async(url, init) => {
				if (String(url).includes('environmentvariabledefinitions?') && !init?.method) {
					return new Response(
						JSON.stringify({
							value: [{ environmentvariabledefinitionid: 'ev-1', schemaname: schemaName }],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } },
					);
				}
				return new Response('should not POST', { status: 500 });
			},
		);

		expect(result.applied).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.failed).toHaveLength(0);
	});

	it('sends MSCRM.SolutionUniqueName when creating connection references into a solution', async() => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const refRequest = plan.requests.find((request) => request.kind === 'connectionreference');
		expect(refRequest).toBeTruthy();
		let sawSolutionHeader = false;

		const result = await applyDataversePlan(
			{ ...plan, requests: [refRequest!] },
			'token',
			{
				solutionUniqueName: 'DocumentRouting',
				fetchImpl: async(url, init) => {
					if (String(url).includes('connectionreferences?') && !init?.method) {
						return new Response(JSON.stringify({ value: [] }), {
							status: 200,
							headers: { 'Content-Type': 'application/json' },
						});
					}
					if (init?.method === 'POST') {
						const headers = init.headers as Record<string, string>;
						sawSolutionHeader = headers['MSCRM.SolutionUniqueName'] === 'DocumentRouting';
						return new Response(null, { status: 204 });
					}
					return new Response('unexpected', { status: 500 });
				},
			},
		);

		expect(result.applied).toBe(1);
		expect(sawSolutionHeader).toBe(true);
	});
});
