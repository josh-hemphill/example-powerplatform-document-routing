import { describe, expect, it } from 'vitest';
import {
	mergeAccumulatedPage,
	shouldReplaceListPage,
} from './accumulated-list-page.ts';

describe('accumulated list pages', () => {
	it('replaces rows on the first page and appends later pages', () => {
		const first = mergeAccumulatedPage(
			[{ id: 'stale' }],
			[{ id: 'a' }, { id: 'b' }],
			undefined,
		);
		expect(first).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(
			mergeAccumulatedPage(first, [{ id: 'b' }, { id: 'c' }], 'cursor-2'),
		).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
	});

	it('keeps the prior list when a query is pending or has no page yet', () => {
		expect(shouldReplaceListPage(true, { items: [] })).toBe(false);
		expect(shouldReplaceListPage(false, undefined)).toBe(false);
		expect(shouldReplaceListPage(false, { items: [] })).toBe(true);
	});
});
