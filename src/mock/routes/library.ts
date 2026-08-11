import type { MockHttpContext } from '../http.ts';
import { toSummary } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';
import { paginateItems, parseListPagination } from '../list-pagination.ts';

export function handleLibraryRoutes(context: MockHttpContext): boolean {
	const { method, path, url, res, sendJson, matchRoute } = context;

	if (method === 'GET' && path === '/api/library') {
		const documentType = url.searchParams.get('documentType');
		const q = url.searchParams.get('q')?.toLowerCase();
		const includeSuperseded
			= url.searchParams.get('includeSuperseded') === 'true';
		const { offset, limit } = parseListPagination(url);
		let records = [...getDocumentStore().values()].filter((document) => {
			if (document.status === 'published') {
				return Boolean(document.documentNumber);
			}
			if (includeSuperseded && document.status === 'superseded') {
				return Boolean(document.documentNumber);
			}
			return false;
		});

		if (documentType) {
			records = records.filter((document) => document.documentType === documentType);
		}
		if (q) {
			records = records.filter((document) =>
				document.title.toLowerCase().includes(q)
				|| Boolean(document.documentNumber?.toLowerCase().includes(q))
				|| document.documentType.toLowerCase().includes(q)
				|| Boolean(document.draftSummary?.toLowerCase().includes(q)));
		}

		records.sort((a, b) =>
			(b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
		);
		const page = paginateItems(records.map(toSummary), offset, limit);
		sendJson(res, 200, page);
		return true;
	}

	const byNumberMatch = matchRoute(
		path,
		/^\/api\/documents\/by-number\/([^/]+)$/,
	);
	if (method === 'GET' && byNumberMatch) {
		const documentNumber = decodeURIComponent(byNumberMatch[1]);
		const match = [...getDocumentStore().values()].find(
			(document) =>
				document.documentNumber === documentNumber
				&& document.status === 'published',
		);
		if (!match) {
			sendJson(res, 404, {
				message: 'No current published document for this number',
				code: 'not_found',
			});
			return true;
		}
		sendJson(res, 200, match);
		return true;
	}

	return false;
}
