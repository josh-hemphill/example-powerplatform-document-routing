import type { MockApprovalStep, MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	openAuthoritativeComments,
	previewLastComment,
} from '../domain/review-comments.ts';
import { stamp } from './http.ts';

export function toSummary(document: MockDocumentRecord) {
	return {
		id: document.id,
		title: document.title,
		documentType: document.documentType,
		documentSubtypeId: document.documentSubtypeId,
		status: document.status,
		requesterEmail: document.requesterEmail,
		collaboratorEmails: document.collaboratorEmails,
		priority: document.priority,
		openAuthoritativeCommentCount: openAuthoritativeComments(document.reviewComments).length,
		lastReviewCommentPreview: previewLastComment(document.reviewComments),
		currentApproverEmail: document.currentApproverEmail,
		currentStepStatus: document.currentStepStatus,
		currentStepDueAt: document.currentStepDueAt,
		currentStepElevated: document.currentStepElevated,
		currentPoolEmails: document.currentPoolEmails,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		contentRevision: document.contentRevision,
		submittedContentRevision: document.submittedContentRevision,
		publishedContentRevision: document.publishedContentRevision,
		documentNumber: document.documentNumber,
		documentVersion: document.documentVersion,
		supersedesDocumentId: document.supersedesDocumentId,
		supersededByDocumentId: document.supersededByDocumentId,
		publishedAt: document.publishedAt,
	};
}

export function pushHistory(
	document: MockDocumentRecord,
	actorEmail: string,
	action: string,
	message: string,
	reviewCommentId?: string | null,
): void {
	document.history.unshift({
		id: randomUUID(),
		at: stamp(),
		actorEmail,
		action,
		message,
		reviewCommentId: reviewCommentId ?? null,
	});
	document.updatedAt = stamp();
}

export function activeStep(document: MockDocumentRecord): MockApprovalStep | undefined {
	return document.approvalSteps.find(
		(step) => step.status === 'queued' || step.status === 'pending',
	);
}
