/**
 * End-to-end mock workflow: create → collaborative draft → submit → claim → decide → publish.
 * Exercises control store, document store, approval engine, and publish engine together.
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { appConfig } from '../config/app.config.ts';
import { toApprovalStepInputs } from '../config/document-types.ts';
import { canActorEditDraft } from '../domain/document-access.ts';
import {
	isSameRevisionAlreadyPublished,
	resolveTrustedPublishTarget,
} from '../publishing/publish-engine.ts';
import { buildSharePointDocumentUrl } from '../publishing/sharepoint-paths.ts';
import {
	claimStep,
	createStepFromInput,
	decideStep,
	syncCurrentApprovalFields,
} from './approval-engine.ts';
import {
	findControlDocumentType,
	getControlStore,
	materializeApprovalSteps,
	recordFlowRun,
	resetControlStore,
	toDocumentTypeDefinition,
} from './control-store.ts';
import {
	clearDocumentStore,
	getDocumentStore,
} from './document-store.ts';

const REQUESTER = 'alex.requester@contoso.com';
const AUTHOR = 'casey.author@contoso.com';

function stamp(): string {
	return new Date().toISOString();
}

function createRequest(actor: string): MockDocumentRecord {
	const typeRow = findControlDocumentType('policy');
	expect(typeRow?.active).toBe(true);
	const type = toDocumentTypeDefinition(typeRow!);
	const id = randomUUID();
	const createdAt = stamp();
	const document: MockDocumentRecord = {
		id,
		title: 'E2E Policy Request',
		documentType: type.id,
		status: 'requested',
		requesterEmail: actor,
		collaboratorEmails: [actor, ...(type.authorTeamEmails ?? [])].filter(
			(email, index, all) =>
				all.findIndex((item) => item.toLowerCase() === email.toLowerCase()) === index,
		),
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Please draft a collaborative e2e policy document.',
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
		requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
		requestedLibraryName: appConfig.sharePoint.libraryName,
	};
	getDocumentStore().set(id, document);
	return document;
}

describe('mock workflow e2e', () => {
	beforeEach(() => {
		resetControlStore();
		clearDocumentStore();
	});

	it('runs create → co-edit → submit → claim → decide → publish (idempotent republish)', () => {
		const document = createRequest(REQUESTER);
		expect(canActorEditDraft(document, AUTHOR)).toBe(true);

		// Collaborative draft by a second author on the type team.
		document.title = 'E2E Policy Request';
		document.draftBodyMarkdown = '# E2E Policy\n\nCollaborative body.';
		document.draftSummary = 'E2E summary';
		document.authorEmail = AUTHOR;
		document.status = 'drafting';
		document.contentRevision = 1;
		document.updatedAt = stamp();

		const stepsInput = materializeApprovalSteps(document.documentType);
		expect(stepsInput?.length).toBeGreaterThan(0);
		const clock = new Date('2026-01-01T12:00:00.000Z');
		const revision = document.contentRevision;
		const fallback = toApprovalStepInputs(
			toDocumentTypeDefinition(findControlDocumentType(document.documentType)!).approvalChain,
		);
		document.approvalSteps = (stepsInput ?? fallback).map((step, index) =>
			createStepFromInput(step, index + 1, clock, index === 0, revision),
		);
		document.status = 'in_review';
		document.submittedContentRevision = revision;
		syncCurrentApprovalFields(document);
		expect(document.status).toBe('in_review');
		expect(document.approvalSteps.length).toBeGreaterThan(0);

		// Drive each active step to approved (claim pools when needed).
		for (let guard = 0; guard < 10; guard += 1) {
			const active = document.approvalSteps.find(
				(step) => step.status === 'queued' || step.status === 'pending',
			);
			if (!active) {
				break;
			}
			if (active.status === 'queued') {
				const claimer = active.pool[0]?.email;
				expect(claimer).toBeTruthy();
				claimStep(active, claimer, clock);
			}
			expect(active.status).toBe('pending');
			const actor = active.approverEmail;
			expect(actor).toBeTruthy();
			decideStep(document, active, actor!, 'approve', clock);
			syncCurrentApprovalFields(document);
		}

		expect(document.status).toBe('approved');
		expect(document.approvalSteps.every((step) => step.status === 'approved')).toBe(true);

		const destinations = getControlStore().publishDestinations.filter((item) => item.active);
		const target = resolveTrustedPublishTarget({
			document: {
				id: document.id,
				title: document.title,
				status: document.status,
				contentRevision: document.contentRevision,
				submittedContentRevision: document.submittedContentRevision,
				publishedContentRevision: document.publishedContentRevision,
				publishedPdfUrl: document.publishedPdfUrl,
				defaultDestinationId: findControlDocumentType(document.documentType)
					?.defaultDestinationId,
			},
			destinations,
		});
		expect(target.idempotent).toBe(false);

		const itemId = randomUUID();
		const publishedAt = stamp();
		document.status = 'published';
		document.publishedContentRevision = target.revision;
		document.sharePointItemId = itemId;
		document.publishedPdfUrl = buildSharePointDocumentUrl({
			siteUrl: target.destination.siteUrl,
			libraryName: target.destination.libraryName,
			folderPath: target.folderPath,
			fileName: target.fileName,
		});
		document.updatedAt = publishedAt;
		recordFlowRun(
			'Document Routing — Publish approved',
			'succeeded',
			`Published PDF revision ${target.revision}`,
		);

		expect(document.publishedPdfUrl).toContain(target.fileName);
		expect(document.publishedContentRevision).toBe(1);
		expect(
			isSameRevisionAlreadyPublished({
				id: document.id,
				title: document.title,
				status: document.status,
				contentRevision: document.contentRevision,
				submittedContentRevision: document.submittedContentRevision,
				publishedContentRevision: document.publishedContentRevision,
				publishedPdfUrl: document.publishedPdfUrl,
			}),
		).toBe(true);

		const republish = resolveTrustedPublishTarget({
			document: {
				id: document.id,
				title: document.title,
				status: document.status,
				contentRevision: document.contentRevision,
				submittedContentRevision: document.submittedContentRevision,
				publishedContentRevision: document.publishedContentRevision,
				publishedPdfUrl: document.publishedPdfUrl,
				defaultDestinationId: findControlDocumentType(document.documentType)
					?.defaultDestinationId,
			},
			destinations,
		});
		expect(republish.idempotent).toBe(true);
		expect(republish.fileName).toBe(target.fileName);

		const health = getControlStore().flowRuns[0];
		expect(health?.flowName).toMatch(/Publish/i);
		expect(health?.status).toBe('succeeded');
	});
});
