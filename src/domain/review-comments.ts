/**
 * Review-comment helpers: authority policy, previews, and resubmit gates.
 * The mock and hosted API must enforce the same rules; UI never owns policy.
 */

export const AUTHORITATIVE_RESPONSE_MIN_LENGTH = 20;
export const REVIEW_COMMENT_PREVIEW_MAX_LENGTH = 140;
export const DEFAULT_AUTHORITY_LEVEL = 'standard' as const;
export const DEFAULT_COMMENT_POLICY = 'required_on_reject' as const;

export type ReviewCommentKind
	= | 'decision'
		| 'submission'
		| 'author_response'
		| 'acknowledgement';

export type ReviewCommentStatus = 'open' | 'addressed' | 'acknowledged' | 'voided';

export type AuthorityLevel = 'advisory' | 'standard' | 'authoritative';

export type CommentPolicy = 'optional' | 'required_on_reject' | 'required_on_decision';

export interface ReviewCommentRecord {
	id: string;
	kind: ReviewCommentKind;
	authorityLevel: AuthorityLevel;
	status: ReviewCommentStatus;
	body: string;
	actorEmail: string;
	actorDisplayName: string;
	role: string | null;
	sourceStepId: string | null;
	sourceStepOrder: number | null;
	submittedContentRevision: number | null;
	inReplyTo: string | null;
	createdAt: string;
}

export interface CommentPolicyStep {
	commentPolicy?: CommentPolicy | null;
	authorityLevel?: AuthorityLevel | null;
}

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
	authoritative: 3,
	standard: 2,
	advisory: 1,
};

/**
 * True when the step’s comment policy requires a non-empty body for this decision.
 */
export function isCommentRequired(
	step: CommentPolicyStep,
	decision: 'approve' | 'reject',
): boolean {
	const policy = step.commentPolicy ?? DEFAULT_COMMENT_POLICY;
	if (policy === 'required_on_decision') {
		return true;
	}
	if (policy === 'required_on_reject') {
		return decision === 'reject';
	}
	return false;
}

/**
 * Open authoritative comments that block resubmit until authors respond.
 */
export function openAuthoritativeComments(
	comments: readonly ReviewCommentLike[] | null | undefined,
): ReviewCommentLike[] {
	return (comments ?? []).filter(
		(comment) =>
			comment.kind === 'decision'
			&& comment.authorityLevel === 'authoritative'
			&& comment.status === 'open',
	);
}

/**
 * Open standard decision comments (acknowledgeable, not blocking).
 */
export function openStandardComments(
	comments: readonly ReviewCommentLike[] | null | undefined,
): ReviewCommentLike[] {
	return (comments ?? []).filter(
		(comment) =>
			comment.kind === 'decision'
			&& comment.authorityLevel === 'standard'
			&& comment.status === 'open',
	);
}

/**
 * True when no open authoritative comments remain.
 */
export function canSubmitWithOpenComments(
	comments: readonly ReviewCommentLike[] | null | undefined,
): boolean {
	return openAuthoritativeComments(comments).length === 0;
}

/**
 * Truncates the newest decision-comment body for inbox/header previews.
 */
export function previewLastComment(
	comments: readonly ReviewCommentLike[] | null | undefined,
	maxLength = REVIEW_COMMENT_PREVIEW_MAX_LENGTH,
): string | null {
	const bodies = (comments ?? [])
		.filter((comment) => comment.kind === 'decision' && comment.body.trim().length > 0)
		.sort((a, b) => {
			const time = b.createdAt.localeCompare(a.createdAt);
			if (time !== 0) {
				return time;
			}
			const rank
				= (AUTHORITY_RANK[b.authorityLevel as AuthorityLevel] ?? 0)
				- (AUTHORITY_RANK[a.authorityLevel as AuthorityLevel] ?? 0);
			return rank;
		});
	const body = bodies[0]?.body.trim();
	if (!body) {
		return null;
	}
	if (body.length <= maxLength) {
		return body;
	}
	return `${body.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * True when a reply body meets the authoritative response minimum.
 */
export function isAuthoritativeResponseLongEnough(body: string): boolean {
	return body.trim().length >= AUTHORITATIVE_RESPONSE_MIN_LENGTH;
}

export interface ReviewCommentLike {
	id: string;
	kind: ReviewCommentKind | string;
	authorityLevel: AuthorityLevel | string;
	status: ReviewCommentStatus | string;
	body: string;
	createdAt: string;
	role?: string | null;
	actorDisplayName?: string;
	submittedContentRevision?: number | null;
}

/**
 * Groups comments for the Review Feedback panel.
 */
export function groupReviewComments(comments: readonly ReviewCommentLike[]): {
	unresolvedAuthoritative: ReviewCommentLike[];
	unresolvedStandard: ReviewCommentLike[];
	unresolvedAdvisory: ReviewCommentLike[];
	addressed: ReviewCommentLike[];
} {
	const decisionComments = comments.filter((comment) => comment.kind === 'decision');
	return {
		unresolvedAuthoritative: decisionComments.filter(
			(comment) => comment.authorityLevel === 'authoritative' && comment.status === 'open',
		),
		unresolvedStandard: decisionComments.filter(
			(comment) => comment.authorityLevel === 'standard' && comment.status === 'open',
		),
		unresolvedAdvisory: decisionComments.filter(
			(comment) => comment.authorityLevel === 'advisory' && comment.status === 'open',
		),
		addressed: decisionComments.filter(
			(comment) => comment.status === 'addressed' || comment.status === 'acknowledged',
		),
	};
}

/**
 * True when the Review Feedback panel should be mounted.
 */
export function isReviewFeedbackVisible(
	status: string,
	commentCount: number,
): boolean {
	if (status === 'published' || status === 'superseded' || status === 'abandoned') {
		return commentCount > 0;
	}
	if (status === 'requested') {
		return commentCount > 0;
	}
	return (
		status === 'in_review'
		|| status === 'rejected'
		|| status === 'drafting'
		|| status === 'approved'
	);
}

/**
 * True when the panel should start expanded.
 */
export function isReviewFeedbackDefaultExpanded(
	status: string,
	openAuthoritativeCount: number,
): boolean {
	if (openAuthoritativeCount > 0 || status === 'rejected' || status === 'in_review') {
		return true;
	}
	return status === 'drafting';
}

/**
 * Inbox/library secondary line for the last review comment or open-count.
 */
export function inboxReviewSecondaryLine(item: {
	status: string;
	lastReviewCommentPreview?: string | null;
	openAuthoritativeCommentCount?: number;
}): string | null {
	const preview = item.lastReviewCommentPreview?.trim() || null;
	if (item.status === 'rejected' && preview) {
		return `Rejected — ${preview}`;
	}
	const open = item.openAuthoritativeCommentCount ?? 0;
	if (open > 0) {
		return `${open} open comment${open === 1 ? '' : 's'}`;
	}
	return preview;
}
/**
 * Default authority for a seeded role label (Admin can override; runtime never infers).
 */
export function seedAuthorityForRole(role: string | null | undefined): AuthorityLevel {
	const normalized = (role ?? '').trim().toLowerCase();
	if (
		normalized.includes('legal')
		|| normalized.includes('compliance')
		|| normalized.includes('counsel')
	) {
		return 'authoritative';
	}
	return DEFAULT_AUTHORITY_LEVEL;
}
