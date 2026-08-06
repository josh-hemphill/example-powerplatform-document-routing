/**
 * Document visibility / draft collaboration rules for the local mock
 * (mirrors Dataverse share-with-author-team behavior).
 */

export interface AccessibleDocument {
	status: string;
	requesterEmail: string;
	authorEmail?: string | null;
	collaboratorEmails: string[];
	currentApproverEmail?: string | null;
	currentPoolEmails: string[];
	approvalSteps: Array<{
		approverEmail?: string | null;
		pool: Array<{ email: string }>;
		elevationPool?: Array<{ email: string }> | null;
	}>;
}

const DRAFT_EDITABLE_STATUSES = new Set(['requested', 'drafting']);

/**
 * True when the actor may list/open the document (owner, collaborator, author, or active approver/pool).
 * Published and superseded controlled documents are readable by any authenticated user (library).
 */
export function canActorAccessDocument(
	document: AccessibleDocument,
	actorEmail: string,
): boolean {
	const email = actorEmail.trim().toLowerCase();
	if (!email) {
		return false;
	}
	if (document.status === 'published' || document.status === 'superseded') {
		return true;
	}
	if (document.requesterEmail.toLowerCase() === email) {
		return true;
	}
	if (document.authorEmail?.toLowerCase() === email) {
		return true;
	}
	if (document.collaboratorEmails.some((item) => item.toLowerCase() === email)) {
		return true;
	}
	if (document.currentApproverEmail?.toLowerCase() === email) {
		return true;
	}
	if (document.currentPoolEmails.some((item) => item.toLowerCase() === email)) {
		return true;
	}
	return document.approvalSteps.some((step) => {
		if (step.approverEmail?.toLowerCase() === email) {
			return true;
		}
		return step.pool.some((member) => member.email.toLowerCase() === email)
			|| (step.elevationPool ?? []).some(
				(member) => member.email.toLowerCase() === email,
			);
	});
}

/** Draft body may only change while the case is requested or drafting. */
export function isDraftEditableStatus(status: string): boolean {
	return DRAFT_EDITABLE_STATUSES.has(status);
}

/**
 * True when the actor is in the draft collaboration set (requester, author, or collaborator).
 * Callers must check `isDraftEditableStatus` separately when status codes matter.
 */
export function canActorMutateDraft(
	document: Pick<AccessibleDocument, 'requesterEmail' | 'authorEmail' | 'collaboratorEmails'>,
	actorEmail: string,
): boolean {
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
 * True when the actor may edit draft content (requested/drafting only).
 */
export function canActorEditDraft(
	document: AccessibleDocument,
	actorEmail: string,
): boolean {
	return isDraftEditableStatus(document.status) && canActorMutateDraft(document, actorEmail);
}
