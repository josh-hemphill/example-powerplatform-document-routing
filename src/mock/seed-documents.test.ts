import { describe, expect, it } from 'vitest';
import { appConfig } from '../config/app.config.ts';
import { createSeedDocuments } from './seed-documents.ts';

describe('createSeedDocuments', () => {
	it('covers workflow statuses needed for local persona demos', () => {
		const docs = createSeedDocuments();
		const statuses = new Set(docs.map((document) => document.status));
		for (const required of [
			'requested',
			'drafting',
			'in_review',
			'approved',
			'rejected',
			'published',
			'abandoned',
		] as const) {
			expect(statuses.has(required), `missing status ${required}`).toBe(true);
		}
	});

	it('uses the configured local demo email for collaboration and named pending', () => {
		const demoEmail = appConfig.localDemoUser.email.toLowerCase();
		const docs = createSeedDocuments();
		expect(
			docs.some((document) =>
				document.collaboratorEmails.some(
					(email) => email.toLowerCase() === demoEmail,
				),
			),
		).toBe(true);
		expect(
			docs.some(
				(document) =>
					document.status === 'in_review'
					&& document.currentStepStatus === 'pending'
					&& document.currentApproverEmail?.toLowerCase() === demoEmail,
			),
		).toBe(true);
		expect(
			docs.some(
				(document) =>
					document.status === 'approved'
					&& document.requesterEmail.length > 0,
			),
		).toBe(true);
		expect(
			docs.some(
				(document) =>
					document.status === 'in_review'
					&& document.currentStepElevated === true,
			),
		).toBe(true);
		expect(
			docs.some(
				(document) =>
					document.status === 'drafting'
					&& Boolean(document.supersedesDocumentId),
			),
		).toBe(true);
	});
});
