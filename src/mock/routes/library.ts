import type { MockHttpContext } from '../http.ts';
import { toSummary } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';

export function handleLibraryRoutes(context: MockHttpContext): boolean {
	const { method, path, url, res, sendJson, matchRoute } = context;

	if (method === 'GET' && path === '/api/library') {
		const documentType = url.searchParams.get('documentType');
		const q = url.searchParams.get('q')?.toLowerCase();
		const includeSuperseded
			= url.searchParams.get('includeSuperseded') === 'true';
		let items = [...getDocumentStore().values()]
			.filter((document) => {
				if (document.status === 'published') {
					return Boolean(document.documentNumber);
				}
				if (includeSuperseded && document.status === 'superseded') {
					return Boolean(document.documentNumber);
				}
				return false;
			})
			.map(toSummary);

		if (documentType) {
			items = items.filter((item) => item.documentType === documentType);
		}
		if (q) {
			items = items.filter((item) => {
				const full = getDocumentStore().get(item.id);
				return (
					item.title.toLowerCase().includes(q)
					|| Boolean(item.documentNumber?.toLowerCase().includes(q))
					|| item.documentType.toLowerCase().includes(q)
					|| Boolean(full?.draftSummary?.toLowerCase().includes(q))
				);
			});
		}

		items.sort((a, b) =>
			(b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
		);
		sendJson(res, 200, { items });
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
