import { describe, expect, it } from 'vitest';
import type { ReviewCommentRecord } from './review-comments.ts';
import {
	AUTHORITATIVE_RESPONSE_MIN_LENGTH,
	canSubmitWithOpenComments,
	groupReviewComments,
	inboxReviewSecondaryLine,
	isAuthoritativeResponseLongEnough,
	isCommentRequired,
	isReviewFeedbackDefaultExpanded,
	isReviewFeedbackVisible,
	openAuthoritativeComments,
	previewLastComment,
	seedAuthorityForRole,
} from './review-comments.ts';

function comment(overrides: Partial<ReviewCommentRecord> = {}): ReviewCommentRecord {
	return {
		id: 'c1',
		kind: 'decision' as const,
		authorityLevel: 'authoritative' as const,
		status: 'open' as const,
		body: 'Need manager attestation language before approval',
		actorEmail: 'sam.compliance@contoso.com',
		actorDisplayName: 'Sam Compliance',
		role: 'Compliance',
		sourceStepId: 'step-1',
		sourceStepOrder: 1,
		submittedContentRevision: 2,
		inReplyTo: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('review comment policy', () => {
	it('requires a comment on reject when policy is required_on_reject', () => {
		expect(isCommentRequired({ commentPolicy: 'required_on_reject' }, 'reject')).toBe(true);
		expect(isCommentRequired({ commentPolicy: 'required_on_reject' }, 'approve')).toBe(false);
		expect(isCommentRequired({ commentPolicy: 'optional' }, 'reject')).toBe(false);
		expect(isCommentRequired({ commentPolicy: 'required_on_decision' }, 'approve')).toBe(true);
	});

	it('defaults missing policy to required_on_reject', () => {
		expect(isCommentRequired({}, 'reject')).toBe(true);
		expect(isCommentRequired({}, 'approve')).toBe(false);
	});

	it('blocks submit while authoritative comments are open', () => {
		const comments = [comment()];
		expect(openAuthoritativeComments(comments)).toHaveLength(1);
		expect(canSubmitWithOpenComments(comments)).toBe(false);
		expect(canSubmitWithOpenComments([comment({ status: 'addressed' })])).toBe(true);
		expect(canSubmitWithOpenComments([comment({ authorityLevel: 'standard' })])).toBe(true);
	});

	it('previews the newest decision body and truncates at 140 chars', () => {
		expect(previewLastComment([comment()])).toBe(
			'Need manager attestation language before approval',
		);
		const long = `x`.repeat(200);
		const preview = previewLastComment([comment({ body: long })]);
		expect(preview).toHaveLength(140);
		expect(preview?.endsWith('…')).toBe(true);
		expect(previewLastComment([])).toBeNull();
	});

	it('groups unresolved authoritative comments first', () => {
		const grouped = groupReviewComments([
			comment({ id: 'a' }),
			comment({
				id: 'b',
				authorityLevel: 'standard',
				body: 'Please add a glossary',
			}),
			comment({ id: 'c', status: 'addressed', body: 'Fixed' }),
		]);
		expect(grouped.unresolvedAuthoritative.map((item) => item.id)).toEqual(['a']);
		expect(grouped.unresolvedStandard.map((item) => item.id)).toEqual(['b']);
		expect(grouped.addressed.map((item) => item.id)).toEqual(['c']);
	});

	it('enforces the named authoritative response minimum', () => {
		expect(isAuthoritativeResponseLongEnough('short')).toBe(false);
		expect(isAuthoritativeResponseLongEnough('x'.repeat(AUTHORITATIVE_RESPONSE_MIN_LENGTH))).toBe(
			true,
		);
	});

	it('seeds Legal and Compliance as authoritative, others standard', () => {
		expect(seedAuthorityForRole('Legal Reviewers')).toBe('authoritative');
		expect(seedAuthorityForRole('Compliance')).toBe('authoritative');
		expect(seedAuthorityForRole('Quality')).toBe('standard');
		expect(seedAuthorityForRole('Communications')).toBe('standard');
	});

	it('controls Review feedback visibility and default expansion', () => {
		expect(isReviewFeedbackVisible('requested', 0)).toBe(false);
		expect(isReviewFeedbackVisible('requested', 1)).toBe(true);
		expect(isReviewFeedbackVisible('rejected', 0)).toBe(true);
		expect(isReviewFeedbackVisible('published', 0)).toBe(false);
		expect(isReviewFeedbackVisible('published', 1)).toBe(true);
		expect(isReviewFeedbackDefaultExpanded('rejected', 0)).toBe(true);
		expect(isReviewFeedbackDefaultExpanded('drafting', 0)).toBe(true);
		expect(isReviewFeedbackDefaultExpanded('approved', 0)).toBe(false);
		expect(isReviewFeedbackDefaultExpanded('approved', 1)).toBe(true);
	});

	it('builds inbox secondary lines from rejected preview or open count', () => {
		expect(inboxReviewSecondaryLine({
			status: 'rejected',
			lastReviewCommentPreview: 'Need manager attestation language before approval',
			openAuthoritativeCommentCount: 1,
		})).toBe('Rejected — Need manager attestation language before approval');
		expect(inboxReviewSecondaryLine({
			status: 'drafting',
			openAuthoritativeCommentCount: 2,
		})).toBe('2 open comments');
		expect(inboxReviewSecondaryLine({
			status: 'in_review',
			lastReviewCommentPreview: 'Looks good',
			openAuthoritativeCommentCount: 0,
		})).toBe('Looks good');
	});
});
