/**
 * HTTP handlers for `/api/control/*` (Dataverse control-table mirror).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ControlChainStep, ControlDocumentType, ControlSettings } from './control-store.ts';
import { randomUUID } from 'node:crypto';
import {

	findDestinationById,
	findPoolById,
	getControlStore,
} from './control-store.ts';

type SendJson = (res: ServerResponse, status: number, body: unknown) => void;

/** Coerces nextSequence to an integer >= 1; falls back when NaN/invalid. */
function normalizeNextSequence(value: unknown, fallback: number): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
		return Math.max(1, Math.trunc(fallback) || 1);
	}
	return parsed;
}

function poolKeyFromName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'pool';
}

function isPoolReferenced(poolKey: string): boolean {
	return getControlStore().documentTypes.some((type) =>
		type.approvalChain.some(
			(step) => step.poolKey === poolKey || step.elevationPoolKey === poolKey,
		),
	);
}

function validateChain(chain: ControlChainStep[]): string | null {
	if (!Array.isArray(chain) || chain.length === 0) {
		return 'Approval chain cannot be empty';
	}
	const store = getControlStore();
	const seenOrders = new Set<number>();
	for (const step of chain) {
		if (!Number.isInteger(step.order) || step.order < 1) {
			return 'Each approval step requires an integer order >= 1';
		}
		if (seenOrders.has(step.order)) {
			return `Duplicate approval step order: ${step.order}`;
		}
		seenOrders.add(step.order);
		if (step.assignmentMode === 'named' && !step.assignee?.email) {
			return `Named step ${step.order} requires an assignee`;
		}
		if (step.assignmentMode === 'pool') {
			if (!step.poolKey) {
				return `Pool step ${step.order} requires poolKey`;
			}
			const pool = store.approverPools.find((item) => item.key === step.poolKey);
			if (!pool?.members.length) {
				return `Pool step ${step.order} references unknown/empty pool ${step.poolKey}`;
			}
		}
		if (step.elevationPoolKey) {
			const elevation = store.approverPools.find(
				(item) => item.key === step.elevationPoolKey,
			);
			if (!elevation) {
				return `Step ${step.order} references unknown elevation pool`;
			}
		}
		if (step.slaHours !== undefined && step.slaHours <= 0) {
			return `Step ${step.order} slaHours must be greater than 0`;
		}
	}
	return null;
}

/** Exported for unit tests. */
export { validateChain as validateControlChain };

/**
 * Handles control API routes. Returns true when the request was fully handled.
 */
export function handleControlApiRequest(options: {
	method: string;
	path: string;
	actor: string;
	isAdmin: boolean;
	req: IncomingMessage;
	res: ServerResponse;
	readJson: <T>(req: IncomingMessage) => Promise<T>;
	sendJson: SendJson;
	matchRoute: (url: string, pattern: RegExp) => RegExpMatchArray | null;
}): Promise<boolean> | boolean {
	const { method, path, isAdmin, req, res, readJson, sendJson, matchRoute } = options;
	if (!path.startsWith('/api/control')) {
		return false;
	}

	const requireAdmin = (): boolean => {
		if (isAdmin) {
			return true;
		}
		sendJson(res, 403, {
			message: 'Document Routing Admin role required',
			code: 'forbidden',
		});
		return false;
	};

	return (async() => {
		if (method === 'GET' && path === '/api/control/document-types') {
			const items = getControlStore().documentTypes.filter(
				(type) => isAdmin || type.active,
			);
			sendJson(res, 200, { items });
			return true;
		}

		if (method === 'POST' && path === '/api/control/document-types') {
			if (!requireAdmin()) {
				return true;
			}
			const body = await readJson<ControlDocumentType>(req);
			if (!body.id?.trim() || !body.label?.trim()) {
				sendJson(res, 400, { message: 'id and label are required', code: 'validation_error' });
				return true;
			}
			if (findControlType(body.id)) {
				sendJson(res, 400, { message: 'Document type id already exists', code: 'validation_error' });
				return true;
			}
			const chainError = validateChain(body.approvalChain ?? []);
			if (chainError) {
				sendJson(res, 400, { message: chainError, code: 'validation_error' });
				return true;
			}
			const created: ControlDocumentType = {
				id: body.id.trim(),
				label: body.label.trim(),
				description: body.description ?? '',
				requestHint: body.requestHint ?? '',
				draftTemplate: body.draftTemplate ?? '',
				folderPath: body.folderPath,
				authorTeamEmails: body.authorTeamEmails ?? [],
				active: body.active ?? true,
				policyVersion: body.policyVersion ?? 1,
				defaultDestinationId: body.defaultDestinationId ?? null,
				numberPrefix:
					body.numberPrefix?.trim()
					|| body.id.trim().slice(0, 3).toUpperCase(),
				numberPattern: body.numberPattern?.trim() || '{prefix}-{yyyy}-{seq:5}',
				nextSequence: normalizeNextSequence(body.nextSequence, 1),
				approvalChain: body.approvalChain,
			};
			getControlStore().documentTypes.push(created);
			sendJson(res, 201, created);
			return true;
		}

		const typeMatch = matchRoute(path, /^\/api\/control\/document-types\/([^/]+)$/);
		if (typeMatch) {
			const type = findControlType(decodeURIComponent(typeMatch[1]));
			if (!type) {
				sendJson(res, 404, { message: 'Document type not found', code: 'not_found' });
				return true;
			}
			if (method === 'GET') {
				if (!isAdmin && !type.active) {
					sendJson(res, 404, { message: 'Document type not found', code: 'not_found' });
					return true;
				}
				sendJson(res, 200, type);
				return true;
			}
			if (method === 'PUT') {
				if (!requireAdmin()) {
					return true;
				}
				const body = await readJson<ControlDocumentType>(req);
				const chainError = validateChain(body.approvalChain ?? type.approvalChain);
				if (chainError) {
					sendJson(res, 400, { message: chainError, code: 'validation_error' });
					return true;
				}
				Object.assign(type, {
					label: body.label ?? type.label,
					description: body.description ?? type.description,
					requestHint: body.requestHint ?? type.requestHint,
					draftTemplate: body.draftTemplate ?? type.draftTemplate,
					folderPath: body.folderPath ?? type.folderPath,
					authorTeamEmails: body.authorTeamEmails ?? type.authorTeamEmails,
					active: body.active ?? type.active,
					policyVersion: (type.policyVersion ?? 1) + 1,
					defaultDestinationId:
						body.defaultDestinationId === undefined
							? type.defaultDestinationId
							: body.defaultDestinationId,
					numberPrefix: body.numberPrefix?.trim() || type.numberPrefix,
					numberPattern: body.numberPattern?.trim() || type.numberPattern,
					nextSequence:
						body.nextSequence === undefined
							? type.nextSequence
							: normalizeNextSequence(body.nextSequence, type.nextSequence),
					approvalChain: body.approvalChain ?? type.approvalChain,
				});
				sendJson(res, 200, type);
				return true;
			}
			if (method === 'DELETE') {
				if (!requireAdmin()) {
					return true;
				}
				type.active = false;
				sendJson(res, 200, type);
				return true;
			}
		}

		if (method === 'GET' && path === '/api/control/approver-pools') {
			if (!requireAdmin()) {
				return true;
			}
			sendJson(res, 200, { items: getControlStore().approverPools });
			return true;
		}

		if (method === 'POST' && path === '/api/control/approver-pools') {
			if (!requireAdmin()) {
				return true;
			}
			const body = await readJson<{
				name: string;
				description?: string;
				members: Array<{ email: string; displayName: string; role?: string }>;
			}>(req);
			if (!body.name?.trim() || !body.members?.length) {
				sendJson(res, 400, {
					message: 'name and at least one member are required',
					code: 'validation_error',
				});
				return true;
			}
			const key = poolKeyFromName(body.name);
			if (getControlStore().approverPools.some((pool) => pool.key === key)) {
				sendJson(res, 400, { message: 'Pool key already exists', code: 'validation_error' });
				return true;
			}
			const created = {
				id: randomUUID(),
				key,
				name: body.name.trim(),
				description: body.description ?? '',
				members: body.members,
			};
			getControlStore().approverPools.push(created);
			sendJson(res, 201, created);
			return true;
		}

		const poolMatch = matchRoute(path, /^\/api\/control\/approver-pools\/([^/]+)$/);
		if (poolMatch) {
			const pool = findPoolById(poolMatch[1]);
			if (!pool) {
				sendJson(res, 404, { message: 'Pool not found', code: 'not_found' });
				return true;
			}
			if (method === 'PUT') {
				if (!requireAdmin()) {
					return true;
				}
				const body = await readJson<{
					name: string;
					description?: string;
					members: Array<{ email: string; displayName: string; role?: string }>;
				}>(req);
				if (!body.members?.length) {
					sendJson(res, 400, {
						message: 'Pool must keep at least one member',
						code: 'validation_error',
					});
					return true;
				}
				pool.name = body.name?.trim() || pool.name;
				pool.description = body.description ?? pool.description;
				pool.members = body.members;
				sendJson(res, 200, pool);
				return true;
			}
			if (method === 'DELETE') {
				if (!requireAdmin()) {
					return true;
				}
				if (isPoolReferenced(pool.key)) {
					sendJson(res, 409, {
						message: 'Pool is referenced by a document type chain',
						code: 'conflict',
					});
					return true;
				}
				const store = getControlStore();
				store.approverPools = store.approverPools.filter((item) => item.id !== pool.id);
				res.statusCode = 204;
				res.end();
				return true;
			}
		}

		if (method === 'GET' && path === '/api/control/publish-destinations') {
			const items = getControlStore().publishDestinations.filter(
				(item) => isAdmin || item.active,
			);
			sendJson(res, 200, { items });
			return true;
		}

		if (method === 'POST' && path === '/api/control/publish-destinations') {
			if (!requireAdmin()) {
				return true;
			}
			const body = await readJson<{
				name: string;
				siteUrl: string;
				libraryName: string;
				folderPath: string;
				active?: boolean;
			}>(req);
			if (!body.name || !body.siteUrl || !body.libraryName) {
				sendJson(res, 400, {
					message: 'name, siteUrl, and libraryName are required',
					code: 'validation_error',
				});
				return true;
			}
			if (!/^https:\/\//i.test(body.siteUrl)) {
				sendJson(res, 400, {
					message: 'siteUrl must be HTTPS',
					code: 'validation_error',
				});
				return true;
			}
			const created = {
				id: randomUUID(),
				name: body.name,
				siteUrl: body.siteUrl,
				libraryName: body.libraryName,
				folderPath: body.folderPath ?? '/',
				active: body.active ?? true,
			};
			getControlStore().publishDestinations.push(created);
			sendJson(res, 201, created);
			return true;
		}

		const destinationMatch = matchRoute(
			path,
			/^\/api\/control\/publish-destinations\/([^/]+)$/,
		);
		if (destinationMatch) {
			const destination = findDestinationById(destinationMatch[1]);
			if (!destination) {
				sendJson(res, 404, { message: 'Destination not found', code: 'not_found' });
				return true;
			}
			if (method === 'PUT') {
				if (!requireAdmin()) {
					return true;
				}
				const body = await readJson<typeof destination>(req);
				Object.assign(destination, {
					name: body.name ?? destination.name,
					siteUrl: body.siteUrl ?? destination.siteUrl,
					libraryName: body.libraryName ?? destination.libraryName,
					folderPath: body.folderPath ?? destination.folderPath,
					active: body.active ?? destination.active,
				});
				sendJson(res, 200, destination);
				return true;
			}
			if (method === 'DELETE') {
				if (!requireAdmin()) {
					return true;
				}
				destination.active = false;
				sendJson(res, 200, destination);
				return true;
			}
		}

		if (path === '/api/control/settings') {
			if (!requireAdmin()) {
				return true;
			}
			if (method === 'GET') {
				sendJson(res, 200, getControlStore().settings);
				return true;
			}
			if (method === 'PUT') {
				const body = await readJson<Partial<ControlSettings>>(req);
				const settings = getControlStore().settings;
				if (typeof body.allowApproverOverride === 'boolean') {
					settings.allowApproverOverride = body.allowApproverOverride;
				}
				if (typeof body.collaborationMode === 'string') {
					settings.collaborationMode = body.collaborationMode;
				}
				sendJson(res, 200, settings);
				return true;
			}
		}

		if (method === 'GET' && path === '/api/control/flow-runs') {
			if (!requireAdmin()) {
				return true;
			}
			sendJson(res, 200, { items: getControlStore().flowRuns });
			return true;
		}

		sendJson(res, 404, { message: 'Not found', code: 'not_found' });
		return true;
	})();
}

function findControlType(id: string) {
	return getControlStore().documentTypes.find((type) => type.id === id);
}
