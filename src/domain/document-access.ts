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

/**
 * True when the actor may list/open the document (owner, collaborator, author, or active approver/pool).
 */
export function canActorAccessDocument(
	document: AccessibleDocument,
	actorEmail: string,
): boolean {
	const email = actorEmail.trim().toLowerCase();
	if (!email) {
		return false;
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

/**
 * True when the actor may edit draft content (requested/drafting only).
 */
export function canActorEditDraft(
	document: AccessibleDocument,
	actorEmail: string,
): boolean {
	if (document.status !== 'requested' && document.status !== 'drafting') {
		return false;
	}
	const email = actorEmail.trim().toLowerCase();
	return (
		document.requesterEmail.toLowerCase() === email
		|| document.authorEmail?.toLowerCase() === email
		|| document.collaboratorEmails.some((item) => item.toLowerCase() === email)
	);
}
