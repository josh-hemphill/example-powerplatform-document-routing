import type { MockHttpContext } from '../http.ts';
import { getDocumentStore } from '../document-store.ts';
import {
	abandonSupersedeSuccessor,
	supersedeDocument,
} from '../supersede-engine.ts';

function getEngineErrorCode(error: unknown): string {
	return error instanceof Error && 'code' in error
		? String((error as { code: string }).code)
		: 'invalid_state';
}

function statusFromEngineCode(code: string): number {
	return code === 'forbidden'
		? 403
		: code === 'validation_error'
			? 400
			: 409;
}

export async function handleSupersedeRoutes(context: MockHttpContext): Promise<boolean> {
	const {
		method,
		path,
		actor,
		isAdmin,
		req,
		res,
		readJson,
		sendJson,
		matchRoute,
	} = context;

	const supersedeMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/supersede$/,
	);
	if (method === 'POST' && supersedeMatch) {
		const document = getDocumentStore().get(supersedeMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		const body = await readJson<{ comment?: string }>(req);
		try {
			const successor = supersedeDocument(document, actor, {
				isAdmin,
				comment: body.comment,
			});
			sendJson(res, 201, successor);
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			sendJson(res, statusFromEngineCode(code), {
				message: error instanceof Error ? error.message : 'Supersede failed',
				code,
			});
		}
		return true;
	}

	const abandonMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/abandon-supersede$/,
	);
	if (method === 'POST' && abandonMatch) {
		const document = getDocumentStore().get(abandonMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		const body = await readJson<{ comment?: string }>(req);
		try {
			const abandoned = abandonSupersedeSuccessor(document, actor, {
				isAdmin,
				comment: body.comment,
			});
			sendJson(res, 200, abandoned);
		}
		catch(error) {
			const code = getEngineErrorCode(error);
			sendJson(res, statusFromEngineCode(code), {
				message: error instanceof Error ? error.message : 'Abandon failed',
				code,
			});
		}
		return true;
	}

	return false;
}
