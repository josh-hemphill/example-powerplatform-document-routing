/**
 * Shared list pagination helpers for mock document routes.
 */

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

/**
 * Parses limit/cursor query params into a zero-based page window.
 */
export function parseListPagination(url: URL): { offset: number; limit: number } {
	const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIST_LIMIT);
	const limit = Number.isFinite(rawLimit)
		? Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(rawLimit)))
		: DEFAULT_LIST_LIMIT;
	const rawCursor = url.searchParams.get('cursor');
	const offset = rawCursor && /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
	return { offset, limit };
}

/**
 * Slices items and returns the next offset cursor when more remain.
 */
export function paginateItems<T>(
	items: T[],
	offset: number,
	limit: number,
): { items: T[]; nextCursor: string | null } {
	const page = items.slice(offset, offset + limit);
	const nextOffset = offset + page.length;
	const nextCursor = nextOffset < items.length ? String(nextOffset) : null;
	return { items: page, nextCursor };
}
