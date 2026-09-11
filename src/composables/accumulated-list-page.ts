/**
 * Replaces the first page or appends a later page without duplicating ids.
 */
export function mergeAccumulatedPage<T extends { id: string }>(
	accumulated: readonly T[],
	pageItems: readonly T[],
	cursor: string | undefined,
): T[] {
	if (!cursor) {
		return [...pageItems];
	}
	const existing = new Set(accumulated.map((item) => item.id));
	return [
		...accumulated,
		...pageItems.filter((item) => !existing.has(item.id)),
	];
}

/**
 * True when a list query settled with a page payload (keep prior rows otherwise).
 */
export function shouldReplaceListPage(
	pending: boolean,
	page: unknown,
): boolean {
	return !pending && page !== null && page !== undefined;
}
