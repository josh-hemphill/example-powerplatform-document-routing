/**
 * Unit tests for supersede → publish lineage.
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	allocateNextDocumentNumber,
	findControlDocumentType,
	resetControlStore,
} from './control-store.ts';
import { clearDocumentStore, getDocumentStore } from './document-store.ts';
import {
	applySupersessionOnPublish,
	findOpenSuccessor,
	supersedeDocument,
} from './supersede-engine.ts';

const ACTOR = 'alex.requester@contoso.com';

function publishedDoc(): MockDocumentRecord {
	const createdAt = new Date().toISOString();
	const document: MockDocumentRecord = {
		id: '11111111-1111-1111-1111-111111111111',
		title: 'Remote Work Policy',
		documentType: 'policy',
		status: 'published',
		requesterEmail: ACTOR,
		collaboratorEmails: [ACTOR, 'casey.author@contoso.com'],
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Remote work',
		draftBodyMarkdown: '# Remote Work',
		draftSummary: 'Remote work',
		authorEmail: ACTOR,
		contentRevision: 1,
		submittedContentRevision: 1,
		publishedContentRevision: 1,
		documentNumber: 'POL-2026-00001',
		documentVersion: 1,
		supersedesDocumentId: null,
		supersededByDocumentId: null,
		publishedAt: createdAt,
		approvalSteps: [],
		history: [],
		publishedPdfUrl: 'https://contoso.sharepoint.com/docs/POL.pdf',
		sharePointItemId: 'item-1',
		requestedPublishSiteUrl: 'https://contoso.sharepoint.com/sites/docs',
		requestedLibraryName: 'Published Documents',
	};
	getDocumentStore().set(document.id, document);
	return document;
}

describe('supersede engine', () => {
	beforeEach(() => {
		resetControlStore();
		clearDocumentStore();
	});

	it('opens a drafting successor linked to the published prior', () => {
		const prior = publishedDoc();
		const successor = supersedeDocument(prior, ACTOR);
		expect(successor.status).toBe('drafting');
		expect(successor.supersedesDocumentId).toBe(prior.id);
		expect(successor.documentNumber).toBeNull();
		expect(prior.status).toBe('published');
		expect(findOpenSuccessor(prior.id)?.id).toBe(successor.id);
	});

	it('rejects a second open successor', () => {
		const prior = publishedDoc();
		supersedeDocument(prior, ACTOR);
		expect(() => supersedeDocument(prior, ACTOR)).toThrow(/open successor/i);
	});

	it('rejects supersede when not published', () => {
		const prior = publishedDoc();
		prior.status = 'approved';
		expect(() => supersedeDocument(prior, ACTOR)).toThrow(/published/i);
	});

	it('allows Admin when not on the collaboration set', () => {
		const prior = publishedDoc();
		const successor = supersedeDocument(prior, 'admin@contoso.com', { isAdmin: true });
		expect(successor.requesterEmail).toBe('admin@contoso.com');
	});

	it('on successor publish copies number, bumps version, marks prior superseded', () => {
		const prior = publishedDoc();
		const successor = supersedeDocument(prior, ACTOR);
		applySupersessionOnPublish(successor, prior);
		expect(successor.documentNumber).toBe('POL-2026-00001');
		expect(successor.documentVersion).toBe(2);
		expect(prior.status).toBe('superseded');
		expect(prior.supersededByDocumentId).toBe(successor.id);
	});

	it('allocates sequential numbers per type', () => {
		const type = findControlDocumentType('policy');
		expect(type?.nextSequence).toBe(2);
		const first = allocateNextDocumentNumber('sop', new Date('2026-03-01T00:00:00Z'));
		const second = allocateNextDocumentNumber('sop', new Date('2026-03-01T00:00:00Z'));
		expect(first).toBe('SOP-2026-00001');
		expect(second).toBe('SOP-2026-00002');
	});
});
