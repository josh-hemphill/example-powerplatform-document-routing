import { describe, expect, it } from 'vitest';
import {
	slugifyId,
	uniqueLabel,
	uniqueNumberPrefix,
	uniqueSlugId,
} from '@/utils/slugify-id';

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

	it('treats human labels as taken when their slug matches', () => {
		expect(uniqueSlugId('New document type', ['New document type'])).toBe(
			'new-document-type-2',
		);
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

	it('uniquifies against existing human labels', () => {
		expect(
			uniqueLabel('New document type', ['New document type']),
		).toBe('New document type 2');
	});
});

describe('uniqueNumberPrefix', () => {
	it('uses the first three alphanumeric characters when free', () => {
		expect(uniqueNumberPrefix('new-document-type', ['SOP', 'POL'])).toBe('NEW');
	});

	it('appends a numeric suffix when the prefix is taken', () => {
		expect(uniqueNumberPrefix('new-document-type', ['NEW'])).toBe('NEW2');
		expect(uniqueNumberPrefix('new-document-type', ['NEW', 'NEW2'])).toBe('NEW3');
		expect(uniqueNumberPrefix('new-document-type-2', ['NEW', 'NEW2'])).toBe('NEW3');
	});
});
