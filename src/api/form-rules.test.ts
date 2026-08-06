import { describe, expect, it } from 'vitest';
import {
	emailRules,
	FREEFORM_MIN_LENGTH,
	freeformRequestRules,
	TITLE_MAX_LENGTH,
	titleRules,
} from '@/api/form-rules';

describe('form-rules', () => {
	it('enforces OpenAPI title length', () => {
		const [required, length] = titleRules();
		expect(required('')).not.toBe(true);
		expect(length('ab')).not.toBe(true);
		expect(length('abc')).toBe(true);
		expect(length('x'.repeat(TITLE_MAX_LENGTH + 1))).not.toBe(true);
	});

	it('enforces freeform minimum length', () => {
		const [, length] = freeformRequestRules();
		expect(length('short')).not.toBe(true);
		expect(length('x'.repeat(FREEFORM_MIN_LENGTH))).toBe(true);
	});

	it('validates email format', () => {
		const [rule] = emailRules();
		expect(rule('')).toBe(true);
		expect(rule('not-an-email')).not.toBe(true);
		expect(rule('a@b.co')).toBe(true);
	});
});
