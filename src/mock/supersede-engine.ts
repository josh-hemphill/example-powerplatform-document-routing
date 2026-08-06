/**
 * Supersede a published controlled document by opening a successor case.
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import { engineError } from './approval-engine.ts';
import { getDocumentStore } from './document-store.ts';

function canSupersedeActor(document: MockDocumentRecord, actorEmail: string): boolean {
	const email = actorEmail.trim().toLowerCase();
	if (!email) {
		return false;
	}
	return (
		document.requesterEmail.toLowerCase() === email
		|| document.authorEmail?.toLowerCase() === email
		|| document.collaboratorEmails.some((item) => item.toLowerCase() === email)
	);
}

/**
 * True when another non-terminal case already supersedes this published document.
 */
export function findOpenSuccessor(priorId: string): MockDocumentRecord | undefined {
	return [...getDocumentStore().values()].find(
		(item) =>
			item.supersedesDocumentId === priorId
			&& item.status !== 'superseded'
			&& item.status !== 'rejected',
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
	if (!options.isAdmin && !canSupersedeActor(prior, actorEmail)) {
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
		contentRevision: prior.contentRevision,
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
