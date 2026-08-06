import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearDocumentStore,
	getDocumentStore,
	resetDocumentStore,
} from './document-store.ts';
import type { MockDocumentRecord } from './seed-documents.ts';

function stubDocument(id: string): MockDocumentRecord {
	return {
		id,
		title: 'Isolated',
		documentType: 'policy',
		status: 'requested',
		requesterEmail: 'a@b.co',
		collaboratorEmails: [],
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt: '2020-01-01T00:00:00.000Z',
		updatedAt: '2020-01-01T00:00:00.000Z',
		freeformRequest: 'x'.repeat(12),
		draftBodyMarkdown: null,
		draftSummary: null,
		authorEmail: null,
		contentRevision: 0,
		submittedContentRevision: null,
		publishedContentRevision: null,
		approvalSteps: [],
		history: [],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: null,
		requestedLibraryName: null,
	};
}

describe('document-store', () => {
	beforeEach(() => {
		resetDocumentStore();
	});

	it('seeds Contoso samples on reset', () => {
		expect(getDocumentStore().size).toBeGreaterThan(0);
	});

	it('does not auto-reseed after clearDocumentStore', () => {
		expect(getDocumentStore().size).toBeGreaterThan(0);
		clearDocumentStore();
		expect(getDocumentStore().size).toBe(0);
		getDocumentStore().set('only-e2e', stubDocument('only-e2e'));
		expect([...getDocumentStore().keys()]).toEqual(['only-e2e']);
	});
});
