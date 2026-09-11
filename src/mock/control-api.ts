/**
 * HTTP handlers for `/api/control/*` (Dataverse control-table mirror).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
	ControlChainStep,
	ControlDocumentSubtype,
	ControlDocumentType,
	ControlPriorityLevel,
	ControlSettings,
} from './control-store.ts';
import { randomUUID } from 'node:crypto';
import { DEFAULT_COMMENT_POLICY, seedAuthorityForRole } from '../domain/review-comments.ts';
import {
	isCreateWorkflow,
	normalizeRequestFields,
	validateCreateWorkflow,
	validateRequestFields,
} from '../domain/type-request-fields.ts';
import {
	findControlDocumentSubtype,
	findDestinationById,
	findPoolById,
	findPriorityLevel,
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
		step.authorityLevel ??= seedAuthorityForRole(step.role);
		step.commentPolicy ??= DEFAULT_COMMENT_POLICY;
	}
	for (let expected = 1; expected <= chain.length; expected += 1) {
		if (!seenOrders.has(expected)) {
			return `Approval step orders must be contiguous 1..${chain.length}`;
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
			const items = getControlStore().documentTypes
				.filter((type) => isAdmin || type.active)
				.map((type) => typeWithSubtypes(type, isAdmin));
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
			const workflowError = validateCreateWorkflow(body.createWorkflow);
			if (workflowError) {
				sendJson(res, 400, workflowError);
				return true;
			}
			const fieldsError = validateRequestFields(body.requestFields);
			if (fieldsError) {
				sendJson(res, 400, fieldsError);
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
				sequenceYear: new Date().getUTCFullYear(),
				approvalChain: [...(body.approvalChain ?? [])].sort(
					(a, b) => a.order - b.order,
				),
				createWorkflow: isCreateWorkflow(body.createWorkflow)
					? body.createWorkflow
					: 'standard',
				requestFields: body.requestFields
					? normalizeRequestFields(body.requestFields)
					: [],
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
				sendJson(res, 200, typeWithSubtypes(type, isAdmin));
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
				const workflowError = validateCreateWorkflow(body.createWorkflow);
				if (workflowError) {
					sendJson(res, 400, workflowError);
					return true;
				}
				const fieldsError = validateRequestFields(body.requestFields);
				if (fieldsError) {
					sendJson(res, 400, fieldsError);
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
					approvalChain: [...(body.approvalChain ?? type.approvalChain)].sort(
						(a, b) => a.order - b.order,
					),
					createWorkflow: isCreateWorkflow(body.createWorkflow)
						? body.createWorkflow
						: type.createWorkflow,
					requestFields: body.requestFields
						? normalizeRequestFields(body.requestFields)
						: type.requestFields,
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
				const nextSiteUrl = body.siteUrl ?? destination.siteUrl;
				if (!/^https:\/\//i.test(nextSiteUrl)) {
					sendJson(res, 400, {
						message: 'siteUrl must be HTTPS',
						code: 'validation_error',
					});
					return true;
				}
				Object.assign(destination, {
					name: body.name ?? destination.name,
					siteUrl: nextSiteUrl,
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

		if (method === 'GET' && path === '/api/control/priority-levels') {
			const items = getControlStore().priorityLevels.filter(
				(item) => isAdmin || item.active,
			);
			sendJson(res, 200, { items });
			return true;
		}

		if (method === 'POST' && path === '/api/control/priority-levels') {
			if (!requireAdmin()) {
				return true;
			}
			const body = await readJson<ControlPriorityLevel>(req);
			if (!body.key?.trim() || !body.label?.trim()) {
				sendJson(res, 400, { message: 'key and label are required', code: 'validation_error' });
				return true;
			}
			if (findPriorityLevel(body.key.trim())) {
				sendJson(res, 400, { message: 'Priority key already exists', code: 'validation_error' });
				return true;
			}
			const created: ControlPriorityLevel = {
				id: randomUUID(),
				key: body.key.trim(),
				label: body.label.trim(),
				rank: Number.isFinite(body.rank) ? body.rank : 0,
				color: body.color ?? 'default',
				requiresReason: Boolean(body.requiresReason),
				minReasonLength: body.minReasonLength ?? 0,
				reasonHint: body.reasonHint ?? '',
				active: body.active ?? true,
				slaHoursMultiplier: body.slaHoursMultiplier ?? null,
			};
			getControlStore().priorityLevels.push(created);
			sendJson(res, 201, created);
			return true;
		}

		const priorityMatch = matchRoute(path, /^\/api\/control\/priority-levels\/([^/]+)$/);
		if (priorityMatch && method === 'PUT') {
			if (!requireAdmin()) {
				return true;
			}
			const row = findPriorityLevel(decodeURIComponent(priorityMatch[1]));
			if (!row) {
				sendJson(res, 404, { message: 'Priority level not found', code: 'not_found' });
				return true;
			}
			const body = await readJson<Partial<ControlPriorityLevel>>(req);
			Object.assign(row, {
				label: body.label ?? row.label,
				rank: body.rank ?? row.rank,
				color: body.color ?? row.color,
				requiresReason: body.requiresReason ?? row.requiresReason,
				minReasonLength: body.minReasonLength ?? row.minReasonLength,
				reasonHint: body.reasonHint ?? row.reasonHint,
				active: body.active ?? row.active,
				slaHoursMultiplier:
					body.slaHoursMultiplier === undefined
						? row.slaHoursMultiplier
						: body.slaHoursMultiplier,
			});
			sendJson(res, 200, row);
			return true;
		}

		if (method === 'GET' && path === '/api/control/document-subtypes') {
			const typeFilter = new URL(req.url ?? '', 'http://localhost').searchParams.get(
				'documentType',
			);
			const items = getControlStore().documentSubtypes.filter((subtype) => {
				if (!isAdmin && !subtype.active) {
					return false;
				}
				if (typeFilter && subtype.documentTypeId !== typeFilter) {
					return false;
				}
				return true;
			});
			sendJson(res, 200, { items });
			return true;
		}

		if (method === 'POST' && path === '/api/control/document-subtypes') {
			if (!requireAdmin()) {
				return true;
			}
			const body = await readJson<ControlDocumentSubtype>(req);
			const createdOrError = createOrUpdateSubtype(body, null);
			if ('error' in createdOrError) {
				sendJson(res, 400, { message: createdOrError.error, code: 'validation_error' });
				return true;
			}
			getControlStore().documentSubtypes.push(createdOrError);
			sendJson(res, 201, createdOrError);
			return true;
		}

		const subtypeMatch = matchRoute(path, /^\/api\/control\/document-subtypes\/([^/]+)$/);
		if (subtypeMatch) {
			const subtype = findControlDocumentSubtype(decodeURIComponent(subtypeMatch[1]));
			if (!subtype) {
				sendJson(res, 404, { message: 'Document subtype not found', code: 'not_found' });
				return true;
			}
			if (method === 'PUT') {
				if (!requireAdmin()) {
					return true;
				}
				const body = await readJson<ControlDocumentSubtype>(req);
				const updated = createOrUpdateSubtype(
					{ ...body, documentTypeId: body.documentTypeId || subtype.documentTypeId },
					subtype,
				);
				if ('error' in updated) {
					sendJson(res, 400, { message: updated.error, code: 'validation_error' });
					return true;
				}
				Object.assign(subtype, updated, { id: subtype.id, key: subtype.key });
				sendJson(res, 200, subtype);
				return true;
			}
			if (method === 'DELETE') {
				if (!requireAdmin()) {
					return true;
				}
				subtype.active = false;
				sendJson(res, 200, subtype);
				return true;
			}
		}

		sendJson(res, 404, { message: 'Not found', code: 'not_found' });
		return true;
	})();
}

function findControlType(id: string) {
	return getControlStore().documentTypes.find((type) => type.id === id);
}

function typeWithSubtypes(type: ControlDocumentType, isAdmin: boolean) {
	const subtypes = getControlStore().documentSubtypes.filter(
		(subtype) =>
			subtype.documentTypeId === type.id && (isAdmin || subtype.active),
	);
	return { ...type, subtypes };
}

function createOrUpdateSubtype(
	body: Partial<ControlDocumentSubtype> & { key?: string; label?: string; documentTypeId?: string },
	existing: ControlDocumentSubtype | null,
): ControlDocumentSubtype | { error: string } {
	const key = (body.key ?? existing?.key ?? '').trim();
	const label = (body.label ?? existing?.label ?? '').trim();
	const documentTypeId = (body.documentTypeId ?? existing?.documentTypeId ?? '').trim();
	if (!key || !label || !documentTypeId) {
		return { error: 'key, label, and documentTypeId are required' };
	}
	if (!findControlType(documentTypeId)) {
		return { error: `Unknown document type: ${documentTypeId}` };
	}
	const usesOwnChain = body.usesOwnChain ?? existing?.usesOwnChain ?? false;
	const approvalChain = [...(body.approvalChain ?? existing?.approvalChain ?? [])].sort(
		(a, b) => a.order - b.order,
	);
	if (usesOwnChain) {
		const chainError = validateChain(approvalChain);
		if (chainError) {
			return { error: chainError };
		}
	}
	if (!existing) {
		const duplicate = getControlStore().documentSubtypes.some(
			(item) => item.documentTypeId === documentTypeId && item.key === key,
		);
		if (duplicate) {
			return { error: 'Subtype key already exists for this document type' };
		}
	}
	return {
		id: existing?.id ?? randomUUID(),
		key,
		label,
		description: body.description ?? existing?.description ?? '',
		documentTypeId,
		active: body.active ?? existing?.active ?? true,
		requestHint: body.requestHint === undefined ? (existing?.requestHint ?? null) : body.requestHint,
		draftScaffold:
			body.draftScaffold === undefined ? (existing?.draftScaffold ?? null) : body.draftScaffold,
		numberPrefix:
			body.numberPrefix === undefined ? (existing?.numberPrefix ?? null) : body.numberPrefix,
		usesOwnChain,
		approvalChain,
	};
}
