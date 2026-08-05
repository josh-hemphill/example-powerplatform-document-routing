import type { AccessibleDocument } from './document-access.ts';
import { describe, expect, it } from 'vitest';
import {
	canActorAccessDocument,
	canActorEditDraft,
	canActorMutateDraft,
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
});
