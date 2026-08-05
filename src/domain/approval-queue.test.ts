import { describe, expect, it } from 'vitest';
import { toApprovalStepInputs } from '@/config/document-types';
import {
	addHoursIso,
	isEmailInPool,
	isSlaOverdue,
	mergeApproverPools,
} from '@/domain/approval-queue';

describe('approval queue helpers', () => {
	it('detects overdue SLAs', () => {
		expect(isSlaOverdue('2000-01-01T00:00:00.000Z', new Date('2020-01-01'))).toBe(
			true,
		);
		expect(isSlaOverdue('2099-01-01T00:00:00.000Z', new Date('2020-01-01'))).toBe(
			false,
		);
	});

	it('merges elevation pools without duplicates', () => {
		const merged = mergeApproverPools(
			[{ email: 'a@contoso.com', displayName: 'A' }],
			[
				{ email: 'a@contoso.com', displayName: 'A' },
				{ email: 'b@contoso.com', displayName: 'B' },
			],
		);
		expect(merged).toHaveLength(2);
		expect(isEmailInPool(merged, 'B@contoso.com')).toBe(true);
	});

	it('adds SLA hours', () => {
		const result = addHoursIso(2, new Date('2020-01-01T00:00:00.000Z'));
		expect(result).toBe('2020-01-01T02:00:00.000Z');
	});
});

describe('document type step mapping', () => {
	it('maps pool and named templates into submit payloads', () => {
		const steps = toApprovalStepInputs([
			{
				mode: 'pool',
				poolRole: 'Legal',
				slaHours: 8,
				pool: [{ email: 'a@contoso.com', displayName: 'A' }],
				elevationPool: [{ email: 'b@contoso.com', displayName: 'B' }],
			},
			{
				mode: 'named',
				displayName: 'Sam',
				email: 'sam@contoso.com',
				role: 'Compliance',
				slaHours: 24,
			},
		]);
		expect(steps[0]?.assignmentMode).toBe('pool');
		expect(steps[1]?.assignmentMode).toBe('named');
		expect(steps[1]?.assignee?.email).toBe('sam@contoso.com');
	});
});
