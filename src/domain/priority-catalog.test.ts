import { describe, expect, it } from 'vitest';
import { SEED_PRIORITY_LEVELS } from '../config/priority-catalog.ts';
import {
	MISSION_CRITICAL_REASON_MIN_LENGTH,
	validatePrioritySelection,
} from './priority-catalog.ts';

describe('priority catalog validation', () => {
	it('accepts active keys that do not require a reason', () => {
		expect(validatePrioritySelection('normal', null, SEED_PRIORITY_LEVELS)).toBeNull();
		expect(validatePrioritySelection('high', '', SEED_PRIORITY_LEVELS)).toBeNull();
	});

	it('rejects unknown or inactive keys', () => {
		expect(validatePrioritySelection('urgent', null, SEED_PRIORITY_LEVELS)?.code).toBe(
			'unknown_priority',
		);
		const inactive = SEED_PRIORITY_LEVELS.map((row) =>
			row.key === 'low' ? { ...row, active: false } : row,
		);
		expect(validatePrioritySelection('low', null, inactive)?.code).toBe('unknown_priority');
	});

	it('requires a mission-critical reason of the named minimum length', () => {
		expect(validatePrioritySelection('mission_critical', 'too short', SEED_PRIORITY_LEVELS)?.code)
			.toBe('priority_reason_required');
		expect(
			validatePrioritySelection(
				'mission_critical',
				'x'.repeat(MISSION_CRITICAL_REASON_MIN_LENGTH),
				SEED_PRIORITY_LEVELS,
			),
		).toBeNull();
		expect(MISSION_CRITICAL_REASON_MIN_LENGTH).toBe(20);
	});
});
