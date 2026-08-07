import { describe, expect, it } from 'vitest';
import {
	matchesInboxPersona,
	suggestInboxPersona,
} from '@/config/inbox-personas';

describe('suggestInboxPersona', () => {
	it('prefers waiting_on_me over pool when both match', () => {
		const suggested = suggestInboxPersona(
			[
				{
					status: 'in_review',
					requesterEmail: 'a@example.com',
					currentStepStatus: 'queued',
					currentPoolEmails: ['me@example.com'],
				},
				{
					status: 'in_review',
					requesterEmail: 'b@example.com',
					currentStepStatus: 'pending',
					currentApproverEmail: 'me@example.com',
				},
			],
			'me@example.com',
		);
		expect(suggested).toBe('waiting_on_me');
	});

	it('suggests available_in_pool when only queue work exists', () => {
		const suggested = suggestInboxPersona(
			[
				{
					status: 'in_review',
					requesterEmail: 'a@example.com',
					currentStepStatus: 'queued',
					currentPoolEmails: ['me@example.com'],
				},
			],
			'me@example.com',
		);
		expect(suggested).toBe('available_in_pool');
	});

	it('returns null when nothing is actionable', () => {
		expect(
			suggestInboxPersona(
				[{ status: 'drafting', requesterEmail: 'other@example.com' }],
				'me@example.com',
			),
		).toBeNull();
	});
});

describe('matchesInboxPersona', () => {
	it('matches ready_to_publish for approved cases', () => {
		expect(
			matchesInboxPersona(
				{ status: 'approved', requesterEmail: 'a@example.com' },
				'ready_to_publish',
				'me@example.com',
			),
		).toBe(true);
	});
});
