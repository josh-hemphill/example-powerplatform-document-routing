import type { Plugin } from 'vite';
import { handleControlApiRequest } from './control-api.ts';
import { getDocumentStore } from './document-store.ts';
import {
	matchRoute,
	readActorRoles,
	readJson,
	requireActor,
	sendJson,
	stamp,
	uniqueEmails,
} from './http.ts';
import { handleApprovalRoutes } from './routes/approvals.ts';
import { handleDocumentRoutes } from './routes/documents.ts';
import { handleLibraryRoutes } from './routes/library.ts';
import { handlePrincipalRoute } from './routes/principal.ts';
import { handlePublishRoutes } from './routes/publish.ts';
import { handleSupersedeRoutes } from './routes/supersede.ts';

/**
 * Serves an in-memory Document Routing API so the Code App is runnable offline.
 */
export function documentRoutingMockPlugin(): Plugin {
	getDocumentStore();

	return {
		name: 'document-routing-mock',
		configureServer(server) {
			server.middlewares.use(async(req, res, next) => {
				if (!req.url?.startsWith('/api')) {
					next();
					return;
				}

				try {
					const url = new URL(req.url, 'http://localhost');
					const path = url.pathname;
					const method = req.method ?? 'GET';
					const actor = requireActor(req, res);
					if (!actor) {
						return;
					}
					const isAdmin = readActorRoles(req).includes('admin');
					const context = {
						method,
						path,
						url,
						actor,
						isAdmin,
						req,
						res,
						readJson,
						sendJson,
						readActorRoles,
						matchRoute,
						stamp,
						uniqueEmails,
					};

					if (handlePrincipalRoute(context)) {
						return;
					}

					if (
						await handleControlApiRequest({
							method,
							path,
							actor,
							isAdmin,
							req,
							res,
							readJson,
							sendJson,
							matchRoute,
						})
					) {
						return;
					}

					if (
						handleLibraryRoutes(context)
						|| await handleDocumentRoutes(context)
						|| await handleSupersedeRoutes(context)
						|| await handleApprovalRoutes(context)
						|| await handlePublishRoutes(context)
					) {
						return;
					}

					sendJson(res, 404, { message: `No mock route for ${method} ${path}` });
				}
				catch(error) {
					if (res.headersSent) {
						next(error);
						return;
					}
					sendJson(res, 500, {
						message: error instanceof Error ? error.message : 'Mock API failure',
						code: 'mock_error',
					});
				}
			});
		},
	};
}
