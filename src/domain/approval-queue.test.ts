import { describe, expect, it, vi } from 'vitest';
import { toApprovalStepInputs } from '@/config/document-types';
import {
	addHoursIso,
	isEmailInPool,
	isSlaOverdue,
	mergeApproverPools,
	parseInstant,
} from '@/domain/approval-queue';
import { resolveSlaClock } from '@/mock/sla-clock';

describe('approval queue helpers', () => {
	it('detects overdue SLAs', () => {
		expect(isSlaOverdue('2000-01-01T00:00:00.000Z', new Date('2020-01-01'))).toBe(
			true,
		);
		expect(isSlaOverdue('2099-01-01T00:00:00.000Z', new Date('2020-01-01'))).toBe(
			false,
		);
	});

	it('treats invalid timestamps as not overdue', () => {
		expect(isSlaOverdue('not-a-date', new Date('2020-01-01'))).toBe(false);
		expect(parseInstant('nope')).toBeNull();
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

describe('sLA clock resolution', () => {
	it('accepts valid DEV clock overrides', () => {
		vi.stubEnv('DEV', true);
		const clock = resolveSlaClock('2020-06-01T12:00:00.000Z');
		expect(clock.toISOString()).toBe('2020-06-01T12:00:00.000Z');
	});

	it('rejects invalid DEV clock overrides', () => {
		vi.stubEnv('DEV', true);
		expect(() => resolveSlaClock('yesterday')).toThrow(/Invalid now/);
	});
});
