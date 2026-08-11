import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LIST_LIMIT,
	paginateItems,
	parseListPagination,
} from './list-pagination.ts';

describe('list pagination', () => {
	it('defaults limit and treats missing cursor as offset 0', () => {
		const url = new URL('http://localhost/api/documents');
		expect(parseListPagination(url)).toEqual({
			offset: 0,
			limit: DEFAULT_LIST_LIMIT,
		});
	});

	it('clamps limit and parses numeric cursor', () => {
		const url = new URL('http://localhost/api/documents?limit=999&cursor=50');
		expect(parseListPagination(url)).toEqual({ offset: 50, limit: 200 });
	});

	it('returns nextCursor when more items remain', () => {
		const page = paginateItems(['a', 'b', 'c', 'd'], 0, 2);
		expect(page.items).toEqual(['a', 'b']);
		expect(page.nextCursor).toBe('2');
		expect(paginateItems(['a', 'b'], 0, 2).nextCursor).toBeNull();
	});
});
