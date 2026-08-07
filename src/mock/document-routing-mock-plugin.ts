import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { MockDocumentRecord } from './seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	validateBodyMarkdown,
	validateFreeformRequest,
	validateTitle,
} from '../api/form-rules.ts';
import { appConfig } from '../config/app.config.ts';
import { toApprovalStepInputs } from '../config/document-types.ts';
import { resolvePrincipalRolesByEmail } from '../config/local-personas.ts';
import {
	canActorAccessDocument,
	canActorMutateDraft,
	isDraftEditableStatus,
} from '../domain/document-access.ts';
import {
	canActorProcessSla,
	canActorPublishDocument,
} from '../domain/document-authz.ts';
import { toDataverseSecurityRoleNames } from '../domain/security-roles.ts';
import {
	PublishValidationError,
	resolveTrustedPublishTarget,
} from '../publishing/publish-engine.ts';
import { buildSharePointDocumentUrl } from '../publishing/sharepoint-paths.ts';
import {
	claimStep,
	createStepFromInput,
	decideStep,
	processStepSla,
	releaseStep,
	syncCurrentApprovalFields,
	withdrawAndRevise,
} from './approval-engine.ts';
import { handleControlApiRequest } from './control-api.ts';
import {
	allocateNextDocumentNumber,
	findControlDocumentType,
	getControlStore,
	materializeApprovalSteps,
	recordFlowRun,
	toDocumentTypeDefinition,
} from './control-store.ts';
import { getDocumentStore } from './document-store.ts';
import { resolveSlaClock } from './sla-clock.ts';
import {
	applySupersessionOnPublish,
	supersedeDocument,
} from './supersede-engine.ts';

const ACTOR_HEADER = 'x-document-routing-actor';
const ROLES_HEADER = 'x-document-routing-roles';

const stamp = (): string => new Date().toISOString();

async function readJson<T>(req: IncomingMessage): Promise<T> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const raw = Buffer.concat(chunks).toString('utf8');
	return raw.length === 0 ? ({} as T) : (JSON.parse(raw) as T);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
}

function readActorEmail(req: IncomingMessage): string | null {
	const raw = req.headers[ACTOR_HEADER];
	const value = Array.isArray(raw) ? raw[0] : raw;
	const email = value?.trim();
	return email && email.includes('@') ? email : null;
}

function readActorRoles(req: IncomingMessage): string[] {
	const raw = req.headers[ROLES_HEADER];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value) {
		return [];
	}
	return value
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

function requireActor(
	req: IncomingMessage,
	res: ServerResponse,
): string | null {
	const actor = readActorEmail(req);
	if (!actor) {
		sendJson(res, 401, {
			message: `Missing or invalid ${ACTOR_HEADER} (caller principal)`,
			code: 'unauthorized',
		});
		return null;
	}
	return actor;
}

function toSummary(document: MockDocumentRecord) {
	return {
		id: document.id,
		title: document.title,
		documentType: document.documentType,
		status: document.status,
		requesterEmail: document.requesterEmail,
		collaboratorEmails: document.collaboratorEmails,
		priority: document.priority,
		currentApproverEmail: document.currentApproverEmail,
		currentStepStatus: document.currentStepStatus,
		currentStepDueAt: document.currentStepDueAt,
		currentStepElevated: document.currentStepElevated,
		currentPoolEmails: document.currentPoolEmails,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		contentRevision: document.contentRevision,
		submittedContentRevision: document.submittedContentRevision,
		publishedContentRevision: document.publishedContentRevision,
		documentNumber: document.documentNumber,
		documentVersion: document.documentVersion,
		supersedesDocumentId: document.supersedesDocumentId,
		supersededByDocumentId: document.supersededByDocumentId,
		publishedAt: document.publishedAt,
	};
}

function pushHistory(document: MockDocumentRecord, actorEmail: string, action: string, message: string): void {
	document.history.unshift({
		id: randomUUID(),
		at: stamp(),
		actorEmail,
		action,
		message,
	});
	document.updatedAt = stamp();
}

function matchRoute(url: string, pattern: RegExp): RegExpMatchArray | null {
	return url.match(pattern);
}

function activeStep(document: MockDocumentRecord) {
	return document.approvalSteps.find(
		(step) => step.status === 'queued' || step.status === 'pending',
	);
}

function uniqueEmails(emails: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const email of emails) {
		const key = email.trim().toLowerCase();
		if (!key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(email.trim());
	}
	return result;
}

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

					if (method === 'GET' && path === '/api/principal') {
						const roles = resolvePrincipalRolesByEmail(actor);
						sendJson(res, 200, {
							email: actor,
							roles,
							securityRoleNames: toDataverseSecurityRoleNames(roles),
						});
						return;
					}

					const isAdmin = readActorRoles(req).includes('admin');
					const handledControl = await handleControlApiRequest({
						method,
						path,
						actor,
						isAdmin,
						req,
						res,
						readJson,
						sendJson,
						matchRoute,
					});
					if (handledControl) {
						return;
					}

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
						return;
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
							return;
						}
						sendJson(res, 200, match);
						return;
					}

					if (method === 'GET' && path === '/api/documents') {
						const status = url.searchParams.get('status');
						const documentType = url.searchParams.get('documentType');
						const q = url.searchParams.get('q')?.toLowerCase();
						let items = [...getDocumentStore().values()]
							.filter((document) => canActorAccessDocument(document, actor))
							.map(toSummary);

						if (status) {
							items = items.filter((item) => item.status === status);
						}
						if (documentType) {
							items = items.filter((item) => item.documentType === documentType);
						}
						if (q) {
							items = items.filter((item) => {
								const full = getDocumentStore().get(item.id);
								return (
									item.title.toLowerCase().includes(q)
									|| Boolean(full?.freeformRequest.toLowerCase().includes(q))
								);
							});
						}

						items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
						sendJson(res, 200, { items });
						return;
					}

					if (method === 'POST' && path === '/api/documents') {
						const body = await readJson<{
							title: string;
							documentType: string;
							freeformRequest: string;
							priority?: 'low' | 'normal' | 'high';
							requestedPublishSiteUrl?: string;
							requestedLibraryName?: string;
						}>(req);

						const titleError = validateTitle(body.title);
						if (titleError) {
							sendJson(res, 400, { message: titleError, code: 'validation_error' });
							return;
						}
						const freeformError = validateFreeformRequest(body.freeformRequest);
						if (freeformError) {
							sendJson(res, 400, { message: freeformError, code: 'validation_error' });
							return;
						}

						const typeRow = findControlDocumentType(body.documentType);
						if (!typeRow || !typeRow.active) {
							sendJson(res, 400, {
								message: `Unknown document type: ${body.documentType}`,
								code: 'unknown_document_type',
							});
							return;
						}
						const type = toDocumentTypeDefinition(typeRow);
						const id = randomUUID();
						const createdAt = stamp();
						const collaboratorEmails = uniqueEmails([
							actor,
							...(type.authorTeamEmails ?? []),
						]);
						const document: MockDocumentRecord = {
							id,
							title: body.title,
							documentType: type.id,
							status: 'requested',
							requesterEmail: actor,
							collaboratorEmails,
							priority: body.priority ?? 'normal',
							currentApproverEmail: null,
							currentStepStatus: null,
							currentStepDueAt: null,
							currentStepElevated: null,
							currentPoolEmails: [],
							createdAt,
							updatedAt: createdAt,
							freeformRequest: body.freeformRequest,
							draftBodyMarkdown: null,
							draftSummary: null,
							authorEmail: null,
							contentRevision: 0,
							submittedContentRevision: null,
							publishedContentRevision: null,
							documentNumber: null,
							documentVersion: null,
							supersedesDocumentId: null,
							supersededByDocumentId: null,
							publishedAt: null,
							approvalSteps: [],
							history: [],
							publishedPdfUrl: null,
							sharePointItemId: null,
							requestedPublishSiteUrl:
                body.requestedPublishSiteUrl ?? appConfig.sharePoint.siteUrl,
							requestedLibraryName:
                body.requestedLibraryName ?? appConfig.sharePoint.libraryName,
						};
						pushHistory(
							document,
							actor,
							'requested',
							'Freeform request submitted',
						);
						getDocumentStore().set(id, document);
						sendJson(res, 201, document);
						return;
					}

					const documentMatch = matchRoute(path, /^\/api\/documents\/([^/]+)$/);
					if (method === 'GET' && documentMatch) {
						const document = getDocumentStore().get(documentMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						if (!canActorAccessDocument(document, actor)) {
							sendJson(res, 403, {
								message: 'Not allowed to view this document',
								code: 'forbidden',
							});
							return;
						}
						sendJson(res, 200, document);
						return;
					}

					const supersedeMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/supersede$/,
					);
					if (method === 'POST' && supersedeMatch) {
						const document = getDocumentStore().get(supersedeMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						const body = await readJson<{ comment?: string }>(req);
						const roles = readActorRoles(req);
						try {
							const successor = supersedeDocument(document, actor, {
								isAdmin: roles.includes('admin'),
								comment: body.comment,
							});
							sendJson(res, 201, successor);
						}
						catch(error) {
							const code
								= error instanceof Error && 'code' in error
									? String((error as { code: string }).code)
									: 'invalid_state';
							const status
								= code === 'forbidden'
									? 403
									: code === 'validation_error'
										? 400
										: 409;
							sendJson(res, status, {
								message: error instanceof Error ? error.message : 'Supersede failed',
								code,
							});
						}
						return;
					}

					const draftMatch = matchRoute(path, /^\/api\/documents\/([^/]+)\/draft$/);
					if (method === 'PUT' && draftMatch) {
						const document = getDocumentStore().get(draftMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						if (!isDraftEditableStatus(document.status)) {
							sendJson(res, 409, {
								message: 'Draft can only be edited while requested or drafting',
								code: 'invalid_state',
							});
							return;
						}
						if (!canActorMutateDraft(document, actor)) {
							sendJson(res, 403, {
								message:
                  'Only shared authors/requesters can edit drafts in requested/drafting',
								code: 'forbidden',
							});
							return;
						}

						const body = await readJson<{
							title: string;
							bodyMarkdown: string;
							summary?: string;
						}>(req);

						const titleError = validateTitle(body.title);
						if (titleError) {
							sendJson(res, 400, { message: titleError, code: 'validation_error' });
							return;
						}
						const bodyError = validateBodyMarkdown(body.bodyMarkdown);
						if (bodyError) {
							sendJson(res, 400, { message: bodyError, code: 'validation_error' });
							return;
						}

						document.title = body.title;
						document.draftBodyMarkdown = body.bodyMarkdown;
						document.draftSummary = body.summary ?? null;
						document.authorEmail = document.authorEmail ?? actor;
						document.status = 'drafting';
						document.contentRevision += 1;
						pushHistory(
							document,
							actor,
							'draft_updated',
							`Draft content saved (revision ${document.contentRevision})`,
						);
						sendJson(res, 200, document);
						return;
					}

					const submitMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/submit-for-approval$/,
					);
					if (method === 'POST' && submitMatch) {
						const document = getDocumentStore().get(submitMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						if (!canActorMutateDraft(document, actor)) {
							sendJson(res, 403, {
								message: 'Only shared authors/requesters can submit for approval',
								code: 'forbidden',
							});
							return;
						}
						if (document.status !== 'drafting' || !document.draftBodyMarkdown) {
							sendJson(res, 409, {
								message: 'Document must be drafted before approval',
								code: 'invalid_state',
							});
							return;
						}

						const typeRow = findControlDocumentType(document.documentType);
						if (!typeRow || !typeRow.active) {
							sendJson(res, 400, {
								message: `Unknown document type: ${document.documentType}`,
								code: 'unknown_document_type',
							});
							return;
						}

						const body = await readJson<{
							steps?: Array<{
								assignmentMode: 'named' | 'pool';
								role?: string;
								slaHours?: number;
								assignee?: { email: string; displayName: string; role?: string };
								pool?: Array<{ email: string; displayName: string; role?: string }>;
								elevationPool?: Array<{
									email: string;
									displayName: string;
									role?: string;
								}>;
							}>;
							comment?: string;
						}>(req);

						const allowOverride = getControlStore().settings.allowApproverOverride;
						const materialized = materializeApprovalSteps(typeRow.id);
						const stepsInput
							= allowOverride && body.steps && body.steps.length > 0
								? body.steps
								: materialized ?? toApprovalStepInputs(
									toDocumentTypeDefinition(typeRow).approvalChain,
								);

						if (!stepsInput || stepsInput.length === 0) {
							sendJson(res, 400, {
								message: 'Approval chain cannot be empty',
								code: 'empty_approval_chain',
							});
							return;
						}

						const clock = new Date();
						const revision = document.contentRevision;
						try {
							document.approvalSteps = stepsInput.map((step, index) =>
								createStepFromInput(step, index + 1, clock, index === 0, revision),
							);
						}
						catch(error) {
							sendJson(res, 400, {
								message: error instanceof Error ? error.message : 'Invalid approval steps',
								code: 'validation_error',
							});
							return;
						}
						document.submittedContentRevision = revision;
						document.status = 'in_review';
						syncCurrentApprovalFields(document);
						pushHistory(
							document,
							actor,
							'submitted_for_approval',
							body.comment ?? `Submitted to approval chain (revision ${revision})`,
						);
						sendJson(res, 200, document);
						return;
					}

					const withdrawMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/withdraw-and-revise$/,
					);
					if (method === 'POST' && withdrawMatch) {
						const document = getDocumentStore().get(withdrawMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						const body = await readJson<{ comment?: string }>(req);
						try {
							withdrawAndRevise(document, actor);
						}
						catch(error) {
							const code
								= error instanceof Error && 'code' in error
									? String((error as { code: string }).code)
									: 'invalid_state';
							sendJson(res, code === 'forbidden' ? 403 : 409, {
								message: error instanceof Error ? error.message : 'Withdraw failed',
								code,
							});
							return;
						}
						pushHistory(
							document,
							actor,
							'withdrawn_for_revise',
							body.comment ?? 'Withdrawn for revision; approval steps cleared',
						);
						sendJson(res, 200, document);
						return;
					}

					const slaMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/approvals\/process-sla$/,
					);
					if (method === 'POST' && slaMatch) {
						const document = getDocumentStore().get(slaMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						const roles = readActorRoles(req);
						if (!canActorProcessSla(roles, actor)) {
							sendJson(res, 403, {
								message:
									'SLA processing requires Admin or a Flow/service principal',
								code: 'forbidden',
							});
							return;
						}
						const body = await readJson<{ now?: string }>(req);
						let clock: Date;
						try {
							clock = resolveSlaClock(body.now);
						}
						catch(error) {
							sendJson(res, 400, {
								message: error instanceof Error ? error.message : 'Invalid now',
								code: 'validation_error',
							});
							return;
						}
						const step = activeStep(document);
						if (step) {
							const result = processStepSla(step, clock);
							if (result.changed && result.message) {
								pushHistory(
									document,
									'system@sla-processor',
									'sla_elevated',
									result.message,
								);
								recordFlowRun(
									'Document Routing — SLA sweeper',
									'succeeded',
									result.message,
								);
							}
						}
						syncCurrentApprovalFields(document);
						sendJson(res, 200, document);
						return;
					}

					const claimMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/claim$/,
					);
					if (method === 'POST' && claimMatch) {
						const document = getDocumentStore().get(claimMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						const step = document.approvalSteps.find((item) => item.id === claimMatch[2]);
						if (!step) {
							sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' });
							return;
						}
						const active = activeStep(document);
						if (!active || active.id !== step.id) {
							sendJson(res, 409, {
								message: 'Only the current active step can be claimed',
								code: 'invalid_state',
							});
							return;
						}
						const body = await readJson<{ comment?: string }>(req);
						try {
							claimStep(step, actor, new Date());
						}
						catch(error) {
							const code
								= error instanceof Error && 'code' in error
									? String((error as { code: string }).code)
									: 'invalid_state';
							sendJson(res, code === 'forbidden' ? 403 : 409, {
								message: error instanceof Error ? error.message : 'Claim failed',
								code,
							});
							return;
						}
						syncCurrentApprovalFields(document);
						pushHistory(
							document,
							actor,
							'claimed',
							body.comment ?? `Claimed step ${step.order}`,
						);
						sendJson(res, 200, document);
						return;
					}

					const releaseMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/release$/,
					);
					if (method === 'POST' && releaseMatch) {
						const document = getDocumentStore().get(releaseMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						const step = document.approvalSteps.find(
							(item) => item.id === releaseMatch[2],
						);
						if (!step) {
							sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' });
							return;
						}
						const body = await readJson<{ comment?: string }>(req);
						try {
							releaseStep(step, actor);
						}
						catch(error) {
							const code
								= error instanceof Error && 'code' in error
									? String((error as { code: string }).code)
									: 'invalid_state';
							sendJson(res, code === 'forbidden' ? 403 : 409, {
								message: error instanceof Error ? error.message : 'Release failed',
								code,
							});
							return;
						}
						syncCurrentApprovalFields(document);
						pushHistory(
							document,
							actor,
							'released',
							body.comment ?? `Released step ${step.order} back to queue`,
						);
						sendJson(res, 200, document);
						return;
					}

					const decisionMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/decision$/,
					);
					if (method === 'POST' && decisionMatch) {
						const document = getDocumentStore().get(decisionMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}
						if (document.status !== 'in_review') {
							sendJson(res, 409, {
								message: 'Document is not awaiting approval',
								code: 'invalid_state',
							});
							return;
						}

						const step = document.approvalSteps.find(
							(item) => item.id === decisionMatch[2],
						);
						if (!step) {
							sendJson(res, 404, {
								message: 'Approval step not found',
								code: 'not_found',
							});
							return;
						}

						const active = activeStep(document);
						if (!active || active.id !== step.id || step.status !== 'pending') {
							sendJson(res, 409, {
								message: 'Only a claimed/named pending step can be decided',
								code: 'invalid_state',
							});
							return;
						}

						const body = await readJson<{
							decision: string;
							comment?: string;
						}>(req);

						const isLastStep = !document.approvalSteps.some(
							(item) => item.order === step.order + 1,
						);

						try {
							decideStep(
								document,
								step,
								actor,
								body.decision,
								new Date(),
								body.comment,
							);
						}
						catch(error) {
							const code
								= error instanceof Error && 'code' in error
									? String((error as { code: string }).code)
									: 'invalid_state';
							const status
								= code === 'forbidden'
									? 403
									: code === 'validation_error'
										? 400
										: 409;
							sendJson(res, status, {
								message: error instanceof Error ? error.message : 'Decision failed',
								code,
							});
							return;
						}

						const historyAction
							= body.decision === 'reject'
								? 'rejected'
								: isLastStep
									? 'fully_approved'
									: 'step_approved';
						pushHistory(
							document,
							actor,
							historyAction,
							body.comment
							?? (body.decision === 'reject'
								? 'Rejected in approval chain'
								: isLastStep
									? 'All approval steps completed'
									: `Approved step ${step.order}`),
						);
						sendJson(res, 200, document);
						return;
					}

					const publishMatch = matchRoute(
						path,
						/^\/api\/documents\/([^/]+)\/publish$/,
					);
					if (method === 'POST' && publishMatch) {
						const document = getDocumentStore().get(publishMatch[1]);
						if (!document) {
							sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
							return;
						}

						const roles = readActorRoles(req);
						if (!canActorPublishDocument(document, actor, roles)) {
							sendJson(res, 403, {
								message:
									'Publisher or Admin role and document access required to publish',
								code: 'forbidden',
							});
							return;
						}

						const body = await readJson<{
							publishDestinationId?: string;
							folderPathOverride?: string;
						}>(req);

						const typeRow = findControlDocumentType(document.documentType);
						const destinations = getControlStore().publishDestinations;

						try {
							const target = resolveTrustedPublishTarget({
								document: {
									id: document.id,
									title: document.title,
									status: document.status,
									contentRevision: document.contentRevision,
									submittedContentRevision: document.submittedContentRevision,
									publishedContentRevision: document.publishedContentRevision,
									publishedPdfUrl: document.publishedPdfUrl,
									sharePointItemId: document.sharePointItemId,
									defaultDestinationId: typeRow?.defaultDestinationId ?? null,
								},
								destinations,
								publishDestinationId: body.publishDestinationId,
								folderPathOverride: body.folderPathOverride,
							});

							if (target.idempotent) {
								sendJson(res, 200, {
									document,
									pdfFileName: target.fileName,
									sharePointUrl: document.publishedPdfUrl,
									sharePointItemId: document.sharePointItemId,
									publishedAt: document.updatedAt,
									idempotent: true,
								});
								return;
							}

							const sharePointItemId = document.sharePointItemId ?? randomUUID();
							const sharePointUrl = buildSharePointDocumentUrl({
								siteUrl: target.destination.siteUrl,
								libraryName: target.destination.libraryName,
								folderPath: target.folderPath,
								fileName: target.fileName,
							});
							const publishedAt = stamp();

							if (document.supersedesDocumentId) {
								const prior = getDocumentStore().get(document.supersedesDocumentId);
								if (!prior || prior.status !== 'published') {
									sendJson(res, 409, {
										message: 'Superseded prior document is missing or not published',
										code: 'invalid_state',
									});
									return;
								}
								if (!prior.documentNumber?.trim()) {
									sendJson(res, 409, {
										message:
											'Prior published document is missing a controlled document number',
										code: 'invalid_state',
									});
									return;
								}
								try {
									applySupersessionOnPublish(document, prior);
								}
								catch(error) {
									const code
										= error instanceof Error && 'code' in error
											? String((error as { code: string }).code)
											: 'invalid_state';
									sendJson(res, 409, {
										message:
											error instanceof Error
												? error.message
												: 'Supersession failed',
										code,
									});
									return;
								}
								pushHistory(
									prior,
									actor,
									'superseded',
									`Superseded by ${document.id}`,
								);
							}
							else if (!document.documentNumber) {
								document.documentNumber = allocateNextDocumentNumber(
									document.documentType,
								);
								document.documentVersion = 1;
							}

							document.status = 'published';
							document.publishedPdfUrl = sharePointUrl;
							document.sharePointItemId = sharePointItemId;
							document.publishedContentRevision = target.revision;
							document.publishedAt = publishedAt;
							document.requestedPublishSiteUrl = target.destination.siteUrl;
							document.requestedLibraryName = target.destination.libraryName;
							pushHistory(
								document,
								actor,
								'published',
								`Published ${document.documentNumber} v${document.documentVersion} `
								+ `(PDF revision ${target.revision}) to ${target.destination.name}`,
							);
							recordFlowRun(
								'Document Routing — Publish approved',
								'succeeded',
								`Published ${target.fileName} to ${target.destination.name}`,
							);

							sendJson(res, 200, {
								document,
								pdfFileName: target.fileName,
								sharePointUrl,
								sharePointItemId,
								publishedAt: stamp(),
								idempotent: false,
							});
						}
						catch(error) {
							if (error instanceof PublishValidationError) {
								const status
									= error.code === 'invalid_state'
										? 409
										: error.code === 'forbidden'
											? 403
											: 400;
								sendJson(res, status, {
									message: error.message,
									code: error.code,
								});
								return;
							}
							throw error;
						}
						return;
					}

					sendJson(res, 404, { message: `No mock route for ${method} ${path}` });
				}
				catch(error) {
					sendJson(res, 500, {
						message: error instanceof Error ? error.message : 'Mock API failure',
						code: 'mock_error',
					});
				}
			});
		},
	};
}
