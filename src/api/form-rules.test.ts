import { describe, expect, it } from 'vitest';
import {
	bodyMarkdownRules,
	emailRules,
	FREEFORM_MIN_LENGTH,
	freeformRequestRules,
	SUMMARY_MAX_LENGTH,
	summaryRules,
	TITLE_MAX_LENGTH,
	titleRules,
	validateBodyMarkdown,
	validateSummary,
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

	it('rejects whitespace-only draft bodies', () => {
		expect(validateBodyMarkdown('   ')).not.toBeNull();
		expect(validateBodyMarkdown('# Heading')).toBeNull();
		expect(bodyMarkdownRules()[0](' \n\t ')).not.toBe(true);
	});

	it('re-exports named min-length constants used by mock and UI', async() => {
		const { AUTHORITATIVE_RESPONSE_MIN_LENGTH, MISSION_CRITICAL_REASON_MIN_LENGTH, minLengthRule }
			= await import('@/api/form-rules');
		expect(AUTHORITATIVE_RESPONSE_MIN_LENGTH).toBe(20);
		expect(MISSION_CRITICAL_REASON_MIN_LENGTH).toBe(20);
		expect(minLengthRule(20, 'Reason')('too short')).not.toBe(true);
		expect(minLengthRule(20, 'Reason')('x'.repeat(20))).toBe(true);
	});

	it('enforces summary max length', () => {
		expect(validateSummary(undefined)).toBeNull();
		expect(validateSummary('ok')).toBeNull();
		expect(validateSummary('x'.repeat(SUMMARY_MAX_LENGTH + 1))).not.toBeNull();
		expect(summaryRules()[0]('x'.repeat(SUMMARY_MAX_LENGTH))).toBe(true);
	});
});
