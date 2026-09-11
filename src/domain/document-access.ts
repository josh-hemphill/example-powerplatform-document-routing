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
		/** When set, only activated/completed steps grant access (not future `waiting`). */
		status?: string | null;
		approverEmail?: string | null;
		pool: Array<{ email: string }>;
		elevationPool?: Array<{ email: string }> | null;
		/** Elevation-pool members only gain access after SLA elevation. */
		elevated?: boolean | null;
	}>;
	/** Dispatch-to-review types keep the official document editable during review. */
	allowReviewerDraftEdit?: boolean | null;
}

const DRAFT_EDITABLE_STATUSES = new Set(['requested', 'drafting']);

/** Steps that have been activated or decided — future `waiting` steps do not grant access. */
const ACCESSIBLE_STEP_STATUSES = new Set([
	'queued',
	'pending',
	'approved',
	'rejected',
	'skipped',
]);

/**
 * True when the actor may list/open the document (owner, collaborator, author, or active approver/pool).
 * Published and superseded controlled documents are readable by any authenticated user (library).
 * Step-based access is limited to activated/completed steps (`queued` / `pending` / decided) —
 * future `waiting` steps never grant access (including while earlier steps are still in review,
 * and after reject so unused future approvers do not retain draft visibility).
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
		if (step.status != null && !ACCESSIBLE_STEP_STATUSES.has(step.status)) {
			return false;
		}
		if (step.approverEmail?.toLowerCase() === email) {
			return true;
		}
		if (step.pool.some((member) => member.email.toLowerCase() === email)) {
			return true;
		}
		if (!step.elevated) {
			return false;
		}
		return (step.elevationPool ?? []).some(
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
 * True when the actor is the current named approver or a current pool member.
 */
export function isCurrentReviewParticipant(
	document: Pick<AccessibleDocument, 'currentApproverEmail' | 'currentPoolEmails'>,
	actorEmail: string,
): boolean {
	const email = actorEmail.trim().toLowerCase();
	if (!email) {
		return false;
	}
	if (document.currentApproverEmail?.toLowerCase() === email) {
		return true;
	}
	return document.currentPoolEmails.some((member) => member.toLowerCase() === email);
}

/**
 * True when the actor may edit draft content.
 * Requested/drafting: author team. In-review dispatch types: author team or current reviewers.
 */
export function canActorEditDraft(
	document: AccessibleDocument,
	actorEmail: string,
): boolean {
	if (isDraftEditableStatus(document.status)) {
		return canActorMutateDraft(document, actorEmail);
	}
	if (document.status !== 'in_review' || !document.allowReviewerDraftEdit) {
		return false;
	}
	return (
		canActorMutateDraft(document, actorEmail)
		|| isCurrentReviewParticipant(document, actorEmail)
	);
}

export interface SupersedeEligibleDocument {
	status: string;
	requesterEmail: string;
	authorEmail?: string | null;
	collaboratorEmails?: string[] | null;
	supersedesDocumentId?: string | null;
}

const ABANDON_SUCCESSOR_STATUSES = new Set([
	'requested',
	'drafting',
	'in_review',
	'approved',
]);

/**
 * True when the actor is requester, author, or collaborator (ignores admin elevation).
 */
export function isDocumentStakeholder(
	document: Pick<
		SupersedeEligibleDocument,
		'requesterEmail' | 'authorEmail' | 'collaboratorEmails'
	>,
	actorEmail: string,
): boolean {
	const email = actorEmail.trim().toLowerCase();
	if (!email) {
		return false;
	}
	return (
		document.requesterEmail.toLowerCase() === email
		|| document.authorEmail?.toLowerCase() === email
		|| (document.collaboratorEmails ?? []).some((item) => item.toLowerCase() === email)
	);
}

/**
 * True when the actor may open a supersede successor for a published document.
 */
export function canActorSupersedeDocument(
	document: SupersedeEligibleDocument,
	actorEmail: string,
	options: { isAdmin?: boolean; canAct?: boolean } = {},
): boolean {
	if (options.canAct === false) {
		return false;
	}
	const email = actorEmail.trim().toLowerCase();
	if (!email || document.status !== 'published') {
		return false;
	}
	if (options.isAdmin) {
		return true;
	}
	return isDocumentStakeholder(document, email);
}

/**
 * True when the actor may abandon an open supersede successor case.
 */
export function canActorAbandonSupersedeSuccessor(
	document: SupersedeEligibleDocument,
	actorEmail: string,
	options: { isAdmin?: boolean; canAct?: boolean } = {},
): boolean {
	if (options.canAct === false) {
		return false;
	}
	const email = actorEmail.trim().toLowerCase();
	if (!email || !document.supersedesDocumentId) {
		return false;
	}
	if (!ABANDON_SUCCESSOR_STATUSES.has(document.status)) {
		return false;
	}
	if (options.isAdmin) {
		return true;
	}
	return isDocumentStakeholder(document, email);
}
