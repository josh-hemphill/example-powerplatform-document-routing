import type { AccessibleDocument } from './document-access.ts';
import { describe, expect, it } from 'vitest';
import {
	canActorAbandonSupersedeSuccessor,
	canActorAccessDocument,
	canActorEditDraft,
	canActorMutateDraft,
	canActorSupersedeDocument,
	isDraftEditableStatus,
} from './document-access.ts';

function baseDoc(
	overrides: Partial<AccessibleDocument> = {},
): AccessibleDocument {
	return {
		status: 'requested',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['casey.author@contoso.com', 'developer@example.com'],
		authorEmail: null,
		currentApproverEmail: null,
		currentPoolEmails: [],
		approvalSteps: [],
		...overrides,
	};
}

describe('document access', () => {
	it('allows collaborators to open shared drafts', () => {
		const doc = baseDoc();
		expect(canActorAccessDocument(doc, 'casey.author@contoso.com')).toBe(true);
		expect(canActorEditDraft(doc, 'casey.author@contoso.com')).toBe(true);
	});

	it('blocks strangers from drafts', () => {
		const doc = baseDoc();
		expect(canActorAccessDocument(doc, 'stranger@contoso.com')).toBe(false);
		expect(canActorEditDraft(doc, 'stranger@contoso.com')).toBe(false);
		expect(canActorMutateDraft(doc, 'stranger@contoso.com')).toBe(false);
	});

	it('blocks draft edits once in review but keeps collaboration membership', () => {
		const doc = baseDoc({ status: 'in_review' });
		expect(isDraftEditableStatus(doc.status)).toBe(false);
		expect(canActorMutateDraft(doc, 'casey.author@contoso.com')).toBe(true);
		expect(canActorEditDraft(doc, 'casey.author@contoso.com')).toBe(false);
		expect(canActorAccessDocument(doc, 'casey.author@contoso.com')).toBe(true);
	});

	it('allows any authenticated user to read published and superseded library docs', () => {
		expect(
			canActorAccessDocument(baseDoc({ status: 'published' }), 'stranger@contoso.com'),
		).toBe(true);
		expect(
			canActorAccessDocument(baseDoc({ status: 'superseded' }), 'stranger@contoso.com'),
		).toBe(true);
	});

	it('does not grant access via future waiting approval steps', () => {
		const doc = baseDoc({
			status: 'in_review',
			approvalSteps: [
				{
					status: 'pending',
					approverEmail: 'first@contoso.com',
					pool: [],
				},
				{
					status: 'waiting',
					approverEmail: null,
					pool: [{ email: 'future@contoso.com' }],
				},
			],
		});
		expect(canActorAccessDocument(doc, 'first@contoso.com')).toBe(true);
		expect(canActorAccessDocument(doc, 'future@contoso.com')).toBe(false);
	});

	it('does not retain waiting-step access after reject', () => {
		const doc = baseDoc({
			status: 'rejected',
			approvalSteps: [
				{
					status: 'rejected',
					approverEmail: 'first@contoso.com',
					pool: [],
				},
				{
					status: 'waiting',
					approverEmail: null,
					pool: [{ email: 'future@contoso.com' }],
				},
			],
		});
		expect(canActorAccessDocument(doc, 'first@contoso.com')).toBe(true);
		expect(canActorAccessDocument(doc, 'future@contoso.com')).toBe(false);
	});

	it('allows stakeholders and admins to supersede published documents', () => {
		const published = baseDoc({
			status: 'published',
			authorEmail: 'casey.author@contoso.com',
			collaboratorEmails: ['dev@example.com'],
		});
		expect(canActorSupersedeDocument(published, 'alex.requester@contoso.com')).toBe(true);
		expect(canActorSupersedeDocument(published, 'dev@example.com')).toBe(true);
		expect(canActorSupersedeDocument(published, 'stranger@contoso.com')).toBe(false);
		expect(
			canActorSupersedeDocument(published, 'stranger@contoso.com', { isAdmin: true }),
		).toBe(true);
		expect(
			canActorSupersedeDocument(published, 'alex.requester@contoso.com', { canAct: false }),
		).toBe(false);
	});

	it('allows abandoning open supersede successors for stakeholders', () => {
		const successor = {
			...baseDoc({
				status: 'drafting',
				authorEmail: 'casey.author@contoso.com',
			}),
			supersedesDocumentId: 'prior-1',
		};
		expect(canActorAbandonSupersedeSuccessor(successor, 'alex.requester@contoso.com')).toBe(true);
		expect(canActorAbandonSupersedeSuccessor(successor, 'stranger@contoso.com')).toBe(false);
		expect(
			canActorAbandonSupersedeSuccessor(
				{ ...successor, status: 'published' },
				'alex.requester@contoso.com',
			),
		).toBe(false);
	});
});
