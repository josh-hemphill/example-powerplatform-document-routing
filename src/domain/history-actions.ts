/**
 * Human-readable labels for historyevent.action tokens.
 * History stays a short machine audit; reviewcomment holds the comment body.
 */

export const HISTORY_ACTION_LABELS: Record<string, string> = {
	requested: 'Requested',
	draft_updated: 'Draft updated',
	submitted_for_approval: 'Submitted for approval',
	claimed: 'Claimed',
	released: 'Released',
	step_approved: 'Step approved',
	fully_approved: 'Fully approved',
	rejected: 'Rejected',
	withdrawn_for_revise: 'Withdrawn for revision',
	sla_elevated: 'SLA elevated',
	published: 'Published',
	supersede_opened: 'Supersede opened',
	supersede_abandoned: 'Supersede abandoned',
	priority_changed: 'Priority changed',
	review_comment_responded: 'Review comment responded',
	review_comment_acknowledged: 'Review comment acknowledged',
};

/**
 * Returns a display label for a history action token.
 */
export function historyActionLabel(action: string): string {
	return HISTORY_ACTION_LABELS[action] ?? action.replaceAll('_', ' ');
}

/**
 * Short decision audit line (never the comment body).
 */
export function shortDecisionHistoryMessage(
	decision: 'approve' | 'reject',
	role: string | null | undefined,
	isLastStep: boolean,
): string {
	const roleLabel = role?.trim() || 'approver';
	if (decision === 'reject') {
		return `Rejected by ${roleLabel}`;
	}
	if (isLastStep) {
		return `Fully approved by ${roleLabel}`;
	}
	return `Approved by ${roleLabel}`;
}
