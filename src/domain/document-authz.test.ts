import type { AccessibleDocument } from './document-access.ts';
import { describe, expect, it } from 'vitest';
import {
	canActorProcessSla,
	canActorPublishDocument,
	SLA_SERVICE_ACTOR_EMAIL,
} from './document-authz.ts';

function baseDoc(
	overrides: Partial<AccessibleDocument> = {},
): AccessibleDocument {
	return {
		status: 'approved',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['casey.author@contoso.com'],
		authorEmail: 'casey.author@contoso.com',
		currentApproverEmail: null,
		currentPoolEmails: [],
		approvalSteps: [],
		...overrides,
	};
}

describe('canActorPublishDocument', () => {
	it('requires publisher or admin role plus case access', () => {
		const doc = baseDoc();
		expect(
			canActorPublishDocument(doc, 'casey.author@contoso.com', ['publisher']),
		).toBe(true);
		expect(
			canActorPublishDocument(doc, 'alex.requester@contoso.com', ['admin']),
		).toBe(true);
	});

	it('rejects publisher without case access', () => {
		const doc = baseDoc();
		expect(
			canActorPublishDocument(doc, 'stranger@contoso.com', ['publisher']),
		).toBe(false);
	});

	it('rejects case members without publish role', () => {
		const doc = baseDoc();
		expect(
			canActorPublishDocument(doc, 'casey.author@contoso.com', ['user', 'author']),
		).toBe(false);
	});
});

describe('canActorProcessSla', () => {
	it('allows admin and service role tokens', () => {
		expect(canActorProcessSla(['admin'], 'anyone@contoso.com')).toBe(true);
		expect(canActorProcessSla(['service'], 'flow@contoso.com')).toBe(true);
	});

	it('allows the well-known SLA service actor', () => {
		expect(canActorProcessSla([], SLA_SERVICE_ACTOR_EMAIL)).toBe(true);
	});

	it('rejects ordinary end users', () => {
		expect(canActorProcessSla(['user', 'approver'], 'jordan.legal@contoso.com')).toBe(
			false,
		);
		expect(canActorProcessSla(['publisher'], 'pub@contoso.com')).toBe(false);
	});
});
