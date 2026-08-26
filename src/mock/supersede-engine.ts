/**
 * Supersede a published controlled document by opening a successor case.
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	canActorAbandonSupersedeSuccessor,
	canActorSupersedeDocument,
} from '../domain/document-access.ts';
import { engineError } from './approval-engine.ts';
import { getDocumentStore } from './document-store.ts';

const OPEN_SUCCESSOR_STATUSES = new Set([
	'requested',
	'drafting',
	'in_review',
	'approved',
]);

/**
 * True when another non-terminal case already supersedes this published document.
 */
export function findOpenSuccessor(priorId: string): MockDocumentRecord | undefined {
	return [...getDocumentStore().values()].find(
		(item) =>
			item.supersedesDocumentId === priorId
			&& OPEN_SUCCESSOR_STATUSES.has(item.status),
	);
}

/**
 * Creates a drafting successor that will replace a published document on publish.
 */
export function supersedeDocument(
	prior: MockDocumentRecord,
	actorEmail: string,
	options: { isAdmin?: boolean; comment?: string } = {},
): MockDocumentRecord {
	if (prior.status !== 'published') {
		throw engineError(
			'Only published documents can be superseded',
			'invalid_state',
		);
	}
	if (!canActorSupersedeDocument(prior, actorEmail, { isAdmin: options.isAdmin })) {
		throw engineError(
			'Only requester, author, collaborators, or Admin can supersede',
			'forbidden',
		);
	}
	const open = findOpenSuccessor(prior.id);
	if (open) {
		throw engineError(
			`An open successor already exists (${open.id})`,
			'invalid_state',
		);
	}

	const createdAt = new Date().toISOString();
	const titleBase = prior.title.replace(/\s*\(revision\)\s*$/i, '').trim();
	const successor: MockDocumentRecord = {
		id: randomUUID(),
		title: `${titleBase} (revision)`,
		documentType: prior.documentType,
		status: 'drafting',
		requesterEmail: actorEmail,
		collaboratorEmails: [...new Set([
			actorEmail,
			...prior.collaboratorEmails,
			prior.requesterEmail,
			...(prior.authorEmail ? [prior.authorEmail] : []),
		])],
		priority: prior.priority,
		priorityReason: prior.priorityReason,
		documentSubtypeId: prior.documentSubtypeId,
		reviewComments: [],
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest:
			options.comment?.trim()
			|| `Supersede ${prior.documentNumber ?? prior.id}: revise and republish.`,
		draftBodyMarkdown: prior.draftBodyMarkdown,
		draftSummary: prior.draftSummary,
		authorEmail: actorEmail,
		contentRevision: 0,
		submittedContentRevision: null,
		publishedContentRevision: null,
		documentNumber: null,
		documentVersion: null,
		supersedesDocumentId: prior.id,
		supersededByDocumentId: null,
		publishedAt: null,
		approvalSteps: [],
		history: [
			{
				id: randomUUID(),
				at: createdAt,
				actorEmail,
				action: 'supersede_opened',
				message: `Opened to supersede ${prior.documentNumber ?? prior.id}`,
			},
		],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: prior.requestedPublishSiteUrl,
		requestedLibraryName: prior.requestedLibraryName,
	};
	getDocumentStore().set(successor.id, successor);
	return successor;
}

/**
 * Abandons an open supersede successor so a new supersede can be opened.
 */
export function abandonSupersedeSuccessor(
	successor: MockDocumentRecord,
	actorEmail: string,
	options: { isAdmin?: boolean; comment?: string } = {},
): MockDocumentRecord {
	if (!successor.supersedesDocumentId) {
		throw engineError(
			'Only supersede successor cases can be abandoned',
			'invalid_state',
		);
	}
	if (!OPEN_SUCCESSOR_STATUSES.has(successor.status)) {
		throw engineError(
			'Only open successors (requested/drafting/in_review/approved) can be abandoned',
			'invalid_state',
		);
	}
	if (!canActorAbandonSupersedeSuccessor(successor, actorEmail, { isAdmin: options.isAdmin })) {
		throw engineError(
			'Only requester, author, collaborators, or Admin can abandon a successor',
			'forbidden',
		);
	}

	const at = new Date().toISOString();
	successor.status = 'abandoned';
	successor.updatedAt = at;
	successor.approvalSteps = [];
	successor.currentApproverEmail = null;
	successor.currentStepStatus = null;
	successor.currentStepDueAt = null;
	successor.currentStepElevated = null;
	successor.currentPoolEmails = [];
	successor.history = [
		...successor.history,
		{
			id: randomUUID(),
			at,
			actorEmail,
			action: 'supersede_abandoned',
			message:
				options.comment?.trim()
				|| `Abandoned supersede successor for ${successor.supersedesDocumentId}`,
		},
	];
	return successor;
}

/**
 * On successor publish: copy number, bump version, mark prior superseded.
 */
export function applySupersessionOnPublish(
	successor: MockDocumentRecord,
	prior: MockDocumentRecord,
): void {
	if (!prior.documentNumber?.trim()) {
		throw engineError(
			'Prior published document is missing a controlled document number',
			'invalid_state',
		);
	}
	successor.documentNumber = prior.documentNumber;
	successor.documentVersion = (prior.documentVersion ?? 1) + 1;
	prior.status = 'superseded';
	prior.supersededByDocumentId = successor.id;
	prior.updatedAt = new Date().toISOString();
}
