import { describe, expect, it } from 'vitest';
import { appConfig } from '@/config/app.config';
import {
	buildDraftFromTemplate,
	getDocumentType,
} from '@/config/document-types';
import {
	matchesInboxPersona,
} from '@/config/inbox-personas';
import {
	buildPdfFileName,
	renderDocumentHtml,
	resolvePublishTargets,
} from '@/publishing/html-pdf-template';

describe('document types', () => {
	it('returns undefined from findDocumentType for unknown ids', async() => {
		const { findDocumentType, getDocumentType } = await import('@/config/document-types');
		expect(findDocumentType('missing')).toBeUndefined();
		expect(getDocumentType('missing').id).toBe('policy');
	});

	it('fills draft template placeholders', () => {
		const type = getDocumentType('policy');
		const draft = buildDraftFromTemplate(type, 'Travel Policy', 'Need updates');
		expect(draft).toContain('# Travel Policy');
		expect(draft).toContain('Need updates');
	});

	it('puts the local demo email on every seeded author team', async() => {
		const { documentTypes } = await import('@/config/document-types');
		const { localDemoUser } = await import('@/config/local-demo-user');
		for (const type of documentTypes) {
			expect(type.authorTeamEmails?.length).toBeGreaterThan(0);
			expect(type.authorTeamEmails).toContain(localDemoUser.email);
		}
	});

	it('seeds an ILAR process-change type with manager then lead then engineer chain', async() => {
		const { findDocumentType } = await import('@/config/document-types');
		const { localDemoUser } = await import('@/config/local-demo-user');
		const ilar = findDocumentType('ilar');
		expect(ilar).toBeTruthy();
		expect(ilar!.label).toBe('ILAR');
		expect(ilar!.description).toMatch(/Intermediate Liaison Action Request/i);
		expect(ilar!.createWorkflow).toBe('dispatch_to_review');
		expect(ilar!.requestFields?.[0]?.key).toBe('relevantSystems');
		expect(ilar!.subtypes?.map((subtype) => subtype.key)).toEqual([
			'sop',
			'work_instruction',
		]);
		expect(ilar!.draftTemplate).toContain('Official change record');
		expect(ilar!.approvalChain.map((step) =>
			step.mode === 'named' ? step.role : step.poolRole,
		)).toEqual([
			'Engineering Manager',
			'Lead Engineers',
			'Assigned Engineers',
		]);
		const [manager, leads, engineers] = ilar!.approvalChain;
		expect(manager?.mode).toBe('named');
		if (manager?.mode === 'named') {
			expect(manager.email).toBe('lee.engmgr@contoso.com');
		}
		expect(leads?.mode).toBe('pool');
		if (leads?.mode === 'pool') {
			expect(leads.pool.some((member) => member.email === localDemoUser.email)).toBe(
				true,
			);
		}
		expect(engineers?.mode).toBe('pool');
	});
});

describe('inbox personas', () => {
	it('matches available_in_pool for queued membership', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'in_review',
					requesterEmail: 'a@contoso.com',
					currentStepStatus: 'queued',
					currentPoolEmails: ['me@contoso.com'],
				},
				'available_in_pool',
				'me@contoso.com',
			),
		).toBe(true);
	});

	it('matches waiting_on_me for pending assignees', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'in_review',
					requesterEmail: 'a@contoso.com',
					currentApproverEmail: 'me@contoso.com',
					currentStepStatus: 'pending',
				},
				'waiting_on_me',
				'me@contoso.com',
			),
		).toBe(true);
	});

	it('matches waiting_on_me when status is omitted but assignee is set', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'in_review',
					requesterEmail: 'a@contoso.com',
					currentApproverEmail: 'me@contoso.com',
				},
				'waiting_on_me',
				'me@contoso.com',
			),
		).toBe(true);
	});

	it('does not match waiting_on_me for queued pool membership', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'in_review',
					requesterEmail: 'a@contoso.com',
					currentApproverEmail: 'me@contoso.com',
					currentStepStatus: 'queued',
					currentPoolEmails: ['me@contoso.com'],
				},
				'waiting_on_me',
				'me@contoso.com',
			),
		).toBe(false);
	});

	it('matches needs_draft for collaborators on drafting docs', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'drafting',
					requesterEmail: 'a@contoso.com',
					collaboratorEmails: ['me@contoso.com'],
				},
				'needs_draft',
				'me@contoso.com',
			),
		).toBe(true);
	});

	it('does not match needs_draft for unrelated users', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'requested',
					requesterEmail: 'a@contoso.com',
					collaboratorEmails: ['other@contoso.com'],
				},
				'needs_draft',
				'me@contoso.com',
			),
		).toBe(false);
	});

	it('matches ready_to_publish for approved docs when actor can publish', () => {
		expect(
			matchesInboxPersona(
				{
					status: 'approved',
					requesterEmail: 'a@contoso.com',
				},
				'ready_to_publish',
				'anyone@contoso.com',
				['admin'],
			),
		).toBe(true);
	});
});

describe('publishing helpers', () => {
	it('builds a slug file name', () => {
		expect(buildPdfFileName('Q3 Travel Policy!')).toBe('q3-travel-policy.pdf');
	});

	it('resolves SharePoint targets from app config and type folder', () => {
		const targets = resolvePublishTargets({
			id: '1',
			title: 'Policy',
			documentType: 'policy',
			freeformRequest: 'x',
			requesterEmail: 'a@contoso.com',
		});
		expect(targets.siteUrl).toBe(appConfig.sharePoint.siteUrl);
		expect(targets.folderPath).toBe('/Policies');
		expect(resolvePublishTargets({
			id: '2',
			title: 'ILAR',
			documentType: 'ilar',
			freeformRequest: 'x',
			requesterEmail: 'a@contoso.com',
		}).folderPath).toBe('/Process-Changes');
	});

	it('renders HTML that includes title and brand', () => {
		const html = renderDocumentHtml({
			id: '1',
			title: 'Policy One',
			documentType: 'policy',
			freeformRequest: 'Please write this',
			draftBodyMarkdown: '# Body',
			requesterEmail: 'a@contoso.com',
		});
		expect(html).toContain('Policy One');
		expect(html).toContain(appConfig.brand.name);
		expect(html).toContain('# Body');
	});
});
