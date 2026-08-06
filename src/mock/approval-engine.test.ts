import type { MockDocumentRecord } from './seed-documents.ts';
import { describe, expect, it } from 'vitest';
import { addHoursIso } from '../domain/approval-queue.ts';
import {
	claimStep,
	createStepFromInput,
	decideStep,
	processStepSla,
	releaseStep,
	syncCurrentApprovalFields,
	withdrawAndRevise,
} from './approval-engine.ts';

function baseDocument(
	overrides: Partial<MockDocumentRecord> = {},
): MockDocumentRecord {
	const createdAt = '2020-01-01T00:00:00.000Z';
	return {
		id: 'doc-1',
		title: 'Test',
		documentType: 'policy',
		status: 'in_review',
		requesterEmail: 'alex.requester@contoso.com',
		collaboratorEmails: ['casey.author@contoso.com'],
		priority: 'normal',
		currentApproverEmail: null,
		currentStepStatus: null,
		currentStepDueAt: null,
		currentStepElevated: null,
		currentPoolEmails: [],
		createdAt,
		updatedAt: createdAt,
		freeformRequest: 'Please draft',
		draftBodyMarkdown: '# Body',
		draftSummary: null,
		authorEmail: 'casey.author@contoso.com',
		contentRevision: 3,
		submittedContentRevision: 3,
		publishedContentRevision: null,
		approvalSteps: [],
		history: [],
		publishedPdfUrl: null,
		sharePointItemId: null,
		requestedPublishSiteUrl: null,
		requestedLibraryName: null,
		...overrides,
	};
}

describe('approval engine', () => {
	it('preserves activateDueAt across claim and release', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'pool',
				role: 'Legal',
				slaHours: 8,
				pool: [
					{ email: 'jordan.legal@contoso.com', displayName: 'Jordan' },
					{ email: 'avery.counsel@contoso.com', displayName: 'Avery' },
				],
			},
			1,
			clock,
			true,
			1,
		);
		const deadline = step.activateDueAt;
		expect(deadline).toBe(addHoursIso(8, clock));

		claimStep(step, 'jordan.legal@contoso.com', new Date('2020-01-01T01:00:00.000Z'));
		expect(step.activateDueAt).toBe(deadline);
		expect(step.dueAt).toBe(deadline);
		expect(step.status).toBe('pending');

		releaseStep(step, 'jordan.legal@contoso.com');
		expect(step.activateDueAt).toBe(deadline);
		expect(step.dueAt).toBe(deadline);
		expect(step.status).toBe('queued');
	});

	it('converts overdue named steps to an elevated pool queue', () => {
		const activated = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'named',
				role: 'Compliance',
				slaHours: 2,
				assignee: {
					email: 'sam.compliance@contoso.com',
					displayName: 'Sam',
				},
				elevationPool: [
					{
						email: 'chris.compliance@contoso.com',
						displayName: 'Chris',
						role: 'Elevated',
					},
				],
			},
			1,
			activated,
			true,
			2,
		);

		const overdueClock = new Date('2020-01-01T03:00:00.000Z');
		const result = processStepSla(step, overdueClock);
		expect(result.changed).toBe(true);
		expect(step.assignmentMode).toBe('pool');
		expect(step.status).toBe('queued');
		expect(step.elevated).toBe(true);
		expect(step.approverEmail).toBeNull();
		expect(isEmailInElevatedPool(step)).toBe(true);
		expect(step.activateDueAt).toBe(addHoursIso(2, overdueClock));
	});

	it('does not extend SLA when elevating is unavailable and only requeues claimed pool steps', () => {
		const activated = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'pool',
				role: 'Legal',
				slaHours: 1,
				pool: [{ email: 'jordan.legal@contoso.com', displayName: 'Jordan' }],
			},
			1,
			activated,
			true,
			1,
		);
		const deadline = step.activateDueAt;
		claimStep(step, 'jordan.legal@contoso.com', new Date('2020-01-01T00:30:00.000Z'));

		const result = processStepSla(step, new Date('2020-01-01T02:00:00.000Z'));
		expect(result.changed).toBe(true);
		expect(step.status).toBe('queued');
		expect(step.activateDueAt).toBe(deadline);
		expect(step.dueAt).toBe(deadline);
	});

	it('does not report changed on repeated sweeps of an already-queued overdue step', () => {
		const activated = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'pool',
				role: 'Legal',
				slaHours: 1,
				pool: [{ email: 'jordan.legal@contoso.com', displayName: 'Jordan' }],
				elevationPool: [
					{ email: 'pat.counsel@contoso.com', displayName: 'Pat' },
				],
			},
			1,
			activated,
			true,
			1,
		);

		const overdue = new Date('2020-01-01T02:00:00.000Z');
		expect(processStepSla(step, overdue).changed).toBe(true);
		expect(step.elevated).toBe(true);

		const laterOverdue = new Date('2020-01-01T05:00:00.000Z');
		// Still within the post-elevation window — not overdue yet.
		expect(processStepSla(step, laterOverdue).changed).toBe(false);

		const afterElevatedDeadline = new Date(step.activateDueAt!);
		afterElevatedDeadline.setHours(afterElevatedDeadline.getHours() + 1);
		expect(processStepSla(step, afterElevatedDeadline).changed).toBe(false);
		expect(step.status).toBe('queued');
	});

	it('rejects invalid decisions and forbidden actors', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'named',
				assignee: { email: 'sam.compliance@contoso.com', displayName: 'Sam' },
			},
			1,
			clock,
			true,
			1,
		);
		const document = baseDocument({ approvalSteps: [step] });

		expect(() =>
			decideStep(document, step, 'sam.compliance@contoso.com', 'maybe', clock),
		).toThrow(/approve or reject/);

		expect(() =>
			decideStep(document, step, 'stranger@contoso.com', 'approve', clock),
		).toThrow(/assigned\/claimed/);
	});

	it('approves through the chain and snapshots revision', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const first = createStepFromInput(
			{
				assignmentMode: 'named',
				assignee: { email: 'sam.compliance@contoso.com', displayName: 'Sam' },
			},
			1,
			clock,
			true,
			5,
		);
		const second = createStepFromInput(
			{
				assignmentMode: 'named',
				assignee: { email: 'pat.manager@contoso.com', displayName: 'Pat' },
			},
			2,
			clock,
			false,
			5,
		);
		const document = baseDocument({ approvalSteps: [first, second] });

		decideStep(document, first, 'sam.compliance@contoso.com', 'approve', clock);
		expect(first.status).toBe('approved');
		expect(first.approvedRevision).toBe(5);
		expect(second.status).toBe('pending');
		expect(document.status).toBe('in_review');

		decideStep(
			document,
			second,
			'pat.manager@contoso.com',
			'approve',
			new Date('2020-01-01T01:00:00.000Z'),
		);
		expect(document.status).toBe('approved');
	});

	it('withdraws review back to drafting and clears steps', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'named',
				assignee: { email: 'sam.compliance@contoso.com', displayName: 'Sam' },
			},
			1,
			clock,
			true,
			2,
		);
		const document = baseDocument({ approvalSteps: [step] });
		withdrawAndRevise(document, 'casey.author@contoso.com');
		expect(document.status).toBe('drafting');
		expect(document.approvalSteps).toHaveLength(0);
		expect(document.submittedContentRevision).toBeNull();
		syncCurrentApprovalFields(document);
		expect(document.currentStepStatus).toBeNull();
	});

	it('forbids strangers from withdrawing', () => {
		const document = baseDocument();
		expect(() => withdrawAndRevise(document, 'stranger@contoso.com')).toThrow(
			/collaborators/,
		);
	});

	it('rejects a second claimer once the pool step is pending (409/invalid_state)', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'pool',
				role: 'Legal',
				slaHours: 8,
				pool: [
					{ email: 'jordan.legal@contoso.com', displayName: 'Jordan' },
					{ email: 'avery.counsel@contoso.com', displayName: 'Avery' },
				],
			},
			1,
			clock,
			true,
			1,
		);
		claimStep(step, 'jordan.legal@contoso.com', clock);
		expect(step.status).toBe('pending');
		expect(() => claimStep(step, 'avery.counsel@contoso.com', clock)).toThrow(
			/Only queued pool steps can be claimed/,
		);
	});

	it('rejects a double decide on an already decided step (409/invalid_state)', () => {
		const clock = new Date('2020-01-01T00:00:00.000Z');
		const step = createStepFromInput(
			{
				assignmentMode: 'named',
				assignee: { email: 'sam.compliance@contoso.com', displayName: 'Sam' },
			},
			1,
			clock,
			true,
			1,
		);
		const document = baseDocument({ approvalSteps: [step] });
		decideStep(document, step, 'sam.compliance@contoso.com', 'approve', clock);
		expect(document.status).toBe('approved');
		expect(() =>
			decideStep(document, step, 'sam.compliance@contoso.com', 'approve', clock),
		).toThrow(/not awaiting approval|Only a claimed/);
	});
});

function isEmailInElevatedPool(step: {
	pool: Array<{ email: string }>;
}): boolean {
	return step.pool.some(
		(member) => member.email.toLowerCase() === 'chris.compliance@contoso.com',
	);
}
