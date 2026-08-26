import { describe, expect, it } from 'vitest';
import { slugifyId, uniqueLabel, uniqueSlugId } from '@/utils/slugify-id';

describe('slugifyId', () => {
	it('normalizes labels to kebab ids', () => {
		expect(slugifyId('Safety Policy')).toBe('safety-policy');
		expect(slugifyId('  SOP!! 2026 ')).toBe('sop-2026');
	});

	it('falls back when empty', () => {
		expect(slugifyId('***')).toBe('item');
	});
});

describe('uniqueSlugId', () => {
	it('appends a suffix when the base id is taken', () => {
		expect(uniqueSlugId('Policy', ['policy'])).toBe('policy-2');
		expect(uniqueSlugId('Policy', ['policy', 'policy-2'])).toBe('policy-3');
	});
});

describe('uniqueLabel', () => {
	it('keeps the base label when its slug is free', () => {
		expect(uniqueLabel('New approver pool', ['other-pool'])).toBe('New approver pool');
	});

	it('appends a numeric suffix when the slug is taken', () => {
		expect(uniqueLabel('New approver pool', ['new-approver-pool'])).toBe(
			'New approver pool 2',
		);
		expect(
			uniqueLabel('New approver pool', ['new-approver-pool', 'new-approver-pool-2']),
		).toBe('New approver pool 3');
	});
});
