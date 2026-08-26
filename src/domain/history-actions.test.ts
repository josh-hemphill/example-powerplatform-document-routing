import { describe, expect, it } from 'vitest';
import { historyActionLabel, shortDecisionHistoryMessage } from './history-actions.ts';

describe('history actions', () => {
	it('maps known tokens to human labels and falls back for unknown', () => {
		expect(historyActionLabel('rejected')).toBe('Rejected');
		expect(historyActionLabel('withdrawn_for_revise')).toBe('Withdrawn for revision');
		expect(historyActionLabel('custom_event')).toBe('custom event');
	});

	it('keeps decision history short and role-based', () => {
		expect(shortDecisionHistoryMessage('reject', 'Compliance', false)).toBe(
			'Rejected by Compliance',
		);
		expect(shortDecisionHistoryMessage('approve', 'Legal Reviewers', true)).toBe(
			'Fully approved by Legal Reviewers',
		);
		expect(shortDecisionHistoryMessage('approve', null, false)).toBe('Approved by approver');
	});
});
