import type { ConnectionProfile } from './connection-config.ts';
import { describe, expect, it, vi } from 'vitest';
import { buildDataverseProvisionPlan } from './dataverse-provision-plan.ts';
import {
	addEntityToSolution,
	addPlanConnectionReferencesToSolution,
	assertSolutionOwnedByPublisher,
	buildAlmManifest,
	ensurePublisher,
	ensurePublisherAndSolution,
	ensureSolution,
	findPublishersByPrefix,
	isAlreadySolutionComponent,
	isUnmanagedApplyAllowed,
	PublisherCollisionError,
	renderSolutionPackMarkdown,
	renderSolutionPackScript,
	SolutionOwnershipError,
} from './solution-alm.ts';

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

function asFetch(impl: typeof fetch): typeof fetch {
	return impl;
}

describe('buildAlmManifest', () => {
	it('embeds publisher uniqueName and solution uniqueName from the profile', () => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const manifest = buildAlmManifest(profile, plan);
		expect(manifest.publisher.uniqueName).toBe('docrouting');
		expect(manifest.publisher.prefix).toBe('dr');
		expect(manifest.publisher.optionValuePrefix).toBe(72700);
		expect(manifest.solution.uniqueName).toBe('DocumentRouting');
		expect(manifest.solution.version).toBe('1.0.0.0');
		expect(manifest.preferredPath).toBe('solution');
		expect(manifest.tableLogicalNames.length).toBeGreaterThan(0);
		expect(manifest.unmanagedApply.requiresCliFlag).toBe(true);
	});
});

describe('solution pack artifacts', () => {
	it('renders markdown and shell helpers with profile names', () => {
		const profile = sampleProfile();
		const plan = buildDataverseProvisionPlan(profile);
		const manifest = buildAlmManifest(profile, plan);
		const md = renderSolutionPackMarkdown(manifest);
		expect(md).toContain('docrouting');
		expect(md).toContain('DocumentRouting');
		expect(md).toContain('pnpm provision:solution');
		const sh = renderSolutionPackScript(manifest);
		expect(sh).toContain('SOLUTION_UNIQUE_NAME=');
		expect(sh).toContain('DocumentRouting');
	});
});

describe('isUnmanagedApplyAllowed', () => {
	it('requires CLI flag or profile allowUnmanagedApply', () => {
		expect(isUnmanagedApplyAllowed(sampleProfile(), false)).toBe(false);
		expect(isUnmanagedApplyAllowed(sampleProfile(), true)).toBe(true);
		expect(
			isUnmanagedApplyAllowed(
				sampleProfile({ allowUnmanagedApply: true }),
				false,
			),
		).toBe(true);
	});
});

describe('ensurePublisher', () => {
	it('returns existing publisher when uniqueName matches', async() => {
		const fetchImpl = asFetch(
			vi.fn(async() =>
				new Response(
					JSON.stringify({
						value: [
							{
								publisherid: 'pub-1',
								uniquename: 'docrouting',
								friendlyname: 'Document Routing',
								customizationprefix: 'dr',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			),
		);
		const result = await ensurePublisher(
			'https://data.fabrikam.internal/api/data/v9.2',
			sampleProfile(),
			'token',
			fetchImpl,
		);
		expect(result.created).toBe(false);
		expect(result.publisher.publisherid).toBe('pub-1');
	});

	it('fails closed on prefix collision with a different uniqueName', async() => {
		const fetchImpl = asFetch(
			vi.fn(async() =>
				new Response(
					JSON.stringify({
						value: [
							{
								publisherid: 'other',
								uniquename: 'someoneelse',
								friendlyname: 'Other',
								customizationprefix: 'dr',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
			),
		);
		await expect(
			ensurePublisher(
				'https://data.fabrikam.internal/api/data/v9.2',
				sampleProfile(),
				'token',
				fetchImpl,
			),
		).rejects.toBeInstanceOf(PublisherCollisionError);
	});

	it('creates publisher when prefix is free', async() => {
		const fetchImpl = asFetch(async(url, init) => {
			const href = String(url);
			if (href.includes('/publishers?')) {
				return new Response(JSON.stringify({ value: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			if (init?.method === 'POST' && href.endsWith('/publishers')) {
				return new Response(
					JSON.stringify({
						publisherid: 'new-pub',
						uniquename: 'docrouting',
						friendlyname: 'Document Routing',
						customizationprefix: 'dr',
					}),
					{ status: 201, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('unexpected', { status: 500 });
		});
		const result = await ensurePublisher(
			'https://data.fabrikam.internal/api/data/v9.2',
			sampleProfile(),
			'token',
			fetchImpl,
		);
		expect(result.created).toBe(true);
		expect(result.publisher.publisherid).toBe('new-pub');
	});
});

describe('ensurePublisherAndSolution', () => {
	it('creates solution bound to publisher when missing', async() => {
		const fetchImpl = asFetch(async(url, init) => {
			const href = String(url);
			if (href.includes('/publishers?')) {
				return new Response(
					JSON.stringify({
						value: [
							{
								publisherid: 'pub-1',
								uniquename: 'docrouting',
								friendlyname: 'Document Routing',
								customizationprefix: 'dr',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (href.includes('/solutions?')) {
				return new Response(JSON.stringify({ value: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			if (init?.method === 'POST' && href.endsWith('/solutions')) {
				const body = JSON.parse(String(init.body)) as Record<string, unknown>;
				expect(body['publisherid@odata.bind']).toBe('/publishers(pub-1)');
				return new Response(
					JSON.stringify({
						solutionid: 'sol-1',
						uniquename: 'DocumentRouting',
						friendlyname: 'Document Routing',
						version: '1.0.0.0',
						_publisherid_value: 'pub-1',
						ismanaged: false,
					}),
					{ status: 201, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('unexpected', { status: 500 });
		});
		const result = await ensurePublisherAndSolution(
			'https://data.fabrikam.internal/api/data/v9.2',
			sampleProfile(),
			'token',
			fetchImpl,
		);
		expect(result.publisherCreated).toBe(false);
		expect(result.solutionCreated).toBe(true);
		expect(result.solution.solutionid).toBe('sol-1');
	});

	it('fails when an existing solution belongs to another publisher', async() => {
		const fetchImpl = asFetch(async(url) => {
			const href = String(url);
			if (href.includes('/publishers?')) {
				return new Response(
					JSON.stringify({
						value: [
							{
								publisherid: 'pub-1',
								uniquename: 'docrouting',
								friendlyname: 'Document Routing',
								customizationprefix: 'dr',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (href.includes('/solutions?')) {
				return new Response(
					JSON.stringify({
						value: [
							{
								solutionid: 'sol-other',
								uniquename: 'DocumentRouting',
								friendlyname: 'Someone Else',
								version: '1.0.0.0',
								ismanaged: false,
								_publisherid_value: 'other-pub',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			return new Response('unexpected', { status: 500 });
		});
		await expect(
			ensureSolution(
				'https://data.fabrikam.internal/api/data/v9.2',
				sampleProfile(),
				'pub-1',
				'token',
				fetchImpl,
			),
		).rejects.toBeInstanceOf(SolutionOwnershipError);
	});
});

describe('assertSolutionOwnedByPublisher', () => {
	it('rejects managed solutions and missing publisher lookup', () => {
		expect(() =>
			assertSolutionOwnedByPublisher(
				{
					solutionid: 's1',
					uniquename: 'DocumentRouting',
					friendlyname: 'X',
					version: '1.0.0.0',
					ismanaged: true,
					_publisherid_value: 'pub-1',
				},
				'pub-1',
				'DocumentRouting',
			),
		).toThrow(/managed/);
		expect(() =>
			assertSolutionOwnedByPublisher(
				{
					solutionid: 's1',
					uniquename: 'DocumentRouting',
					friendlyname: 'X',
					version: '1.0.0.0',
					ismanaged: false,
				},
				'pub-1',
				'DocumentRouting',
			),
		).toThrow(/could not be verified/);
	});
});

describe('addEntityToSolution', () => {
	it('treats documented already-present components as success', async() => {
		const fetchImpl = asFetch(
			vi.fn(async() =>
				new Response('Component is already in the solution', { status: 400 }),
			),
		);
		await expect(
			addEntityToSolution(
				'https://data.fabrikam.internal/api/data/v9.2',
				'DocumentRouting',
				'meta-1',
				'token',
				fetchImpl,
			),
		).resolves.toBeUndefined();
	});

	it('does not treat unrelated errors containing "already" as success', async() => {
		const fetchImpl = asFetch(
			vi.fn(async() =>
				new Response('The user already lacks privilege Foo', { status: 403 }),
			),
		);
		await expect(
			addEntityToSolution(
				'https://data.fabrikam.internal/api/data/v9.2',
				'DocumentRouting',
				'meta-1',
				'token',
				fetchImpl,
			),
		).rejects.toThrow(/AddSolutionComponent failed/);
	});
});

describe('isAlreadySolutionComponent', () => {
	it('matches only documented duplicate conditions', () => {
		expect(isAlreadySolutionComponent(409, 'conflict')).toBe(true);
		expect(isAlreadySolutionComponent(400, '0x80043b0b')).toBe(true);
		expect(isAlreadySolutionComponent(400, 'already in the solution')).toBe(true);
		expect(isAlreadySolutionComponent(400, 'already lacks privilege')).toBe(false);
	});
});

describe('findPublishersByPrefix', () => {
	it('queries customizationprefix filter', async() => {
		const fetchImpl = asFetch(async(url) => {
			expect(String(url)).toContain('customizationprefix');
			return new Response(JSON.stringify({ value: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});
		const rows = await findPublishersByPrefix(
			'https://data.fabrikam.internal/api/data/v9.2',
			'DR',
			'token',
			fetchImpl,
		);
		expect(rows).toEqual([]);
	});
});

describe('addPlanConnectionReferencesToSolution', () => {
	it('pATCHes a non-empty body with MSCRM.SolutionUniqueName', async() => {
		let patchBody: Record<string, unknown> | undefined;
		let patchHeaders: Record<string, string> | undefined;
		const fetchImpl = asFetch(async(url, init) => {
			const href = String(url);
			if (href.includes('connectionreferences?')) {
				return new Response(
					JSON.stringify({
						value: [
							{
								connectionreferenceid: 'ref-1',
								connectionreferencelogicalname: 'dr_sharepoint',
								connectionreferencedisplayname: 'Document Routing SharePoint',
								description: 'SharePoint library ref',
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				);
			}
			if (init?.method === 'PATCH' && href.includes('connectionreferences(ref-1)')) {
				patchBody = JSON.parse(String(init.body)) as Record<string, unknown>;
				patchHeaders = init.headers as Record<string, string>;
				return new Response(null, { status: 204 });
			}
			return new Response('unexpected', { status: 500 });
		});

		const result = await addPlanConnectionReferencesToSolution(
			'https://data.fabrikam.internal/api/data/v9.2',
			sampleProfile(),
			['dr_sharepoint'],
			'token',
			fetchImpl,
		);

		expect(result.added).toEqual(['dr_sharepoint']);
		expect(result.failed).toHaveLength(0);
		expect(patchBody).toEqual({
			connectionreferencedisplayname: 'Document Routing SharePoint',
			description: 'SharePoint library ref',
		});
		expect(Object.keys(patchBody ?? {})).not.toHaveLength(0);
		expect(patchHeaders?.['MSCRM.SolutionUniqueName']).toBe('DocumentRouting');
	});
});
