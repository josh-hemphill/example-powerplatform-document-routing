import type { InboxPersona } from '../../config/inbox-personas.ts';
import type { MockHttpContext } from '../http.ts';
import type { MockDocumentRecord } from '../seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	validateBodyMarkdown,
	validateFreeformRequest,
	validateSummary,
	validateTitle,
} from '../../api/form-rules.ts';
import { INBOX_PERSONAS, matchesInboxPersona } from '../../config/inbox-personas.ts';
import { resolvePrincipalRolesByEmail } from '../../config/local-personas.ts';
import { buildDraftFromTemplate } from '../../config/document-types.ts';
import {
	canActorAccessDocument,
	canActorEditDraft,
	canActorMutateDraft,
} from '../../domain/document-access.ts';
import {
	typeFieldTemplateValues,
	validateTypeFieldValues,
} from '../../domain/type-request-fields.ts';
import { dispatchDocumentToReview } from '../dispatch-to-review.ts';
import {
	findControlDocumentSubtype,
	findControlDocumentType,
	findPriorityLevel,
	getControlStore,
	toDocumentTypeDefinition,
} from '../control-store.ts';
import { validatePrioritySelection } from '../../domain/priority-catalog.ts';
import { DEFAULT_PRIORITY_KEY } from '../../domain/priority-catalog.ts';
import { pushHistory, toSummary } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';
import { paginateItems, parseListPagination } from '../list-pagination.ts';

const INBOX_PERSONA_VALUES = new Set<string>(INBOX_PERSONAS.map((item) => item.value));

/**
 * Parses an inbox persona query value; unknown values fall back to `all`.
 */
function parseInboxPersona(raw: string | null): InboxPersona {
	if (raw && INBOX_PERSONA_VALUES.has(raw)) {
		return raw as InboxPersona;
	}
	return 'all';
}

export async function handleDocumentRoutes(context: MockHttpContext): Promise<boolean> {
	const {
		method,
		path,
		url,
		actor,
		actorRoles,
		req,
		res,
		readJson,
		sendJson,
		matchRoute,
		stamp,
		uniqueEmails,
	} = context;

	if (method === 'GET' && path === '/api/documents') {
		const status = url.searchParams.get('status');
		const documentType = url.searchParams.get('documentType');
		const q = url.searchParams.get('q')?.toLowerCase();
		const persona = parseInboxPersona(url.searchParams.get('persona'));
		const { offset, limit } = parseListPagination(url);
		const roles = actorRoles.length > 0 ? actorRoles : resolvePrincipalRolesByEmail(actor);

		let records = [...getDocumentStore().values()].filter(
			(document) =>
				document.status !== 'published'
				&& document.status !== 'superseded'
				&& canActorAccessDocument(document, actor),
		);

		if (status) {
			records = records.filter((document) => document.status === status);
		}
		if (documentType) {
			records = records.filter((document) => document.documentType === documentType);
		}
		if (q) {
			records = records.filter((document) =>
				document.title.toLowerCase().includes(q)
				|| document.freeformRequest.toLowerCase().includes(q));
		}
		if (persona !== 'all') {
			records = records.filter((document) =>
				matchesInboxPersona(toSummary(document), persona, actor, roles));
		}

		records.sort((a, b) => {
			const rankDelta = priorityRank(b.priority) - priorityRank(a.priority);
			if (rankDelta !== 0) {
				return rankDelta;
			}
			return b.updatedAt.localeCompare(a.updatedAt);
		});
		const page = paginateItems(records.map(toSummary), offset, limit);
		sendJson(res, 200, page);
		return true;
	}

	if (method === 'POST' && path === '/api/documents') {
		const body = await readJson<{
			title: string;
			documentType: string;
			freeformRequest: string;
			priority?: string;
			priorityReason?: string | null;
			documentSubtypeId?: string | null;
			typeFieldValues?: Record<string, string>;
			requestedPublishSiteUrl?: string;
			requestedLibraryName?: string;
		}>(req);

		const titleError = validateTitle(body.title);
		if (titleError) {
			sendJson(res, 400, { message: titleError, code: 'validation_error' });
			return true;
		}
		const freeformError = validateFreeformRequest(body.freeformRequest);
		if (freeformError) {
			sendJson(res, 400, { message: freeformError, code: 'validation_error' });
			return true;
		}

		const typeRow = findControlDocumentType(body.documentType);
		if (!typeRow || !typeRow.active) {
			sendJson(res, 400, {
				message: `Unknown document type: ${body.documentType}`,
				code: 'unknown_document_type',
			});
			return true;
		}
		const type = toDocumentTypeDefinition(typeRow);
		const subtypes = getControlStore().documentSubtypes.filter(
			(item) => item.documentTypeId === type.id && item.active,
		);
		let documentSubtypeId: string | null = null;
		if (subtypes.length > 0) {
			const requested = body.documentSubtypeId?.trim() ?? '';
			if (!requested) {
				sendJson(res, 400, {
					message: `Document type ${type.id} requires a subtype`,
					code: 'subtype_required',
				});
				return true;
			}
			const subtype = findControlDocumentSubtype(requested, type.id);
			if (!subtype || !subtype.active) {
				sendJson(res, 400, {
					message: `Unknown subtype: ${requested}`,
					code: 'unknown_subtype',
				});
				return true;
			}
			documentSubtypeId = subtype.key;
		}

		const priorityKey = (body.priority ?? DEFAULT_PRIORITY_KEY).trim();
		const priorityError = validatePrioritySelection(
			priorityKey,
			body.priorityReason,
			getControlStore().priorityLevels,
		);
		if (priorityError) {
			sendJson(res, 400, {
				message: priorityError.message,
				code: priorityError.code,
			});
			return true;
		}
		const priorityRow = findPriorityLevel(priorityKey);

		const typeFieldError = validateTypeFieldValues(
			typeRow.requestFields,
			body.typeFieldValues,
		);
		if (typeFieldError) {
			sendJson(res, 400, {
				message: typeFieldError.message,
				code: typeFieldError.code,
			});
			return true;
		}
		const typeFieldValues = Object.fromEntries(
			(typeRow.requestFields ?? []).map((field) => [
				field.key,
				(body.typeFieldValues?.[field.key] ?? '').trim(),
			]),
		);

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
			priority: priorityRow?.key ?? priorityKey,
			priorityReason: priorityRow?.requiresReason
				? (body.priorityReason ?? '').trim()
				: (body.priorityReason?.trim() || null),
			documentSubtypeId,
			typeFieldValues,
			allowReviewerDraftEdit: typeRow.createWorkflow === 'dispatch_to_review',
			reviewComments: [],
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
			// Free-form SharePoint URLs from the client are ignored;
			// trusted publish uses allowlisted destinations only.
			requestedPublishSiteUrl: null,
			requestedLibraryName: null,
		};
		pushHistory(
			document,
			actor,
			'requested',
			'Freeform request submitted',
		);
		if (typeRow.createWorkflow === 'dispatch_to_review') {
			const subtype = documentSubtypeId
				? findControlDocumentSubtype(documentSubtypeId, type.id)
				: undefined;
			document.draftBodyMarkdown = buildDraftFromTemplate(
				type,
				document.title,
				document.freeformRequest,
				{
					template: subtype?.draftScaffold ?? type.draftTemplate,
					fieldValues: typeFieldTemplateValues(typeRow.requestFields, typeFieldValues),
				},
			);
			document.contentRevision = 1;
			document.authorEmail = actor;
			try {
				dispatchDocumentToReview(document, actor);
			}
			catch(error) {
				sendJson(res, 400, {
					message: error instanceof Error ? error.message : 'Failed to dispatch to review',
					code: 'validation_error',
				});
				return true;
			}
		}
		getDocumentStore().set(id, document);
		sendJson(res, 201, document);
		return true;
	}

	const documentMatch = matchRoute(path, /^\/api\/documents\/([^/]+)$/);
	if (method === 'GET' && documentMatch) {
		const document = getDocumentStore().get(documentMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (!canActorAccessDocument(document, actor)) {
			sendJson(res, 403, {
				message: 'Not allowed to view this document',
				code: 'forbidden',
			});
			return true;
		}
		sendJson(res, 200, document);
		return true;
	}

	const priorityMatch = matchRoute(path, /^\/api\/documents\/([^/]+)\/priority$/);
	if (method === 'PUT' && priorityMatch) {
		const document = getDocumentStore().get(priorityMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (!canActorMutateDraft(document, actor)) {
			sendJson(res, 403, {
				message: 'Only shared authors/requesters can change priority',
				code: 'forbidden',
			});
			return true;
		}
		if (document.status !== 'requested' && document.status !== 'drafting') {
			sendJson(res, 409, {
				message: 'Priority can only be changed while requested or drafting',
				code: 'invalid_state',
			});
			return true;
		}
		const body = await readJson<{ priority: string; priorityReason?: string | null }>(req);
		const priorityError = validatePrioritySelection(
			body.priority,
			body.priorityReason,
			getControlStore().priorityLevels,
		);
		if (priorityError) {
			sendJson(res, 400, {
				message: priorityError.message,
				code: priorityError.code,
			});
			return true;
		}
		const priorityRow = findPriorityLevel(body.priority);
		document.priority = priorityRow?.key ?? body.priority.trim();
		document.priorityReason = priorityRow?.requiresReason
			? (body.priorityReason ?? '').trim()
			: (body.priorityReason?.trim() || null);
		pushHistory(
			document,
			actor,
			'priority_changed',
			`Priority set to ${document.priority}`,
		);
		sendJson(res, 200, document);
		return true;
	}

	const draftMatch = matchRoute(path, /^\/api\/documents\/([^/]+)\/draft$/);
	if (method === 'PUT' && draftMatch) {
		const document = getDocumentStore().get(draftMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (!canActorEditDraft(document, actor)) {
			if (document.status === 'in_review' && !document.allowReviewerDraftEdit) {
				sendJson(res, 409, {
					message: 'Draft can only be edited while requested or drafting',
					code: 'invalid_state',
				});
				return true;
			}
			sendJson(res, 403, {
				message: 'Only shared authors or current reviewers can edit this draft',
				code: 'forbidden',
			});
			return true;
		}

		const body = await readJson<{
			title: string;
			bodyMarkdown: string;
			summary?: string;
			expectedContentRevision: number;
		}>(req);

		if (
			typeof body.expectedContentRevision !== 'number'
			|| !Number.isInteger(body.expectedContentRevision)
		) {
			sendJson(res, 400, {
				message: 'expectedContentRevision is required (integer)',
				code: 'validation_error',
			});
			return true;
		}
		if (body.expectedContentRevision !== document.contentRevision) {
			sendJson(res, 409, {
				message:
					'Draft was updated by someone else; reload and retry',
				code: 'revision_conflict',
				currentRevision: document.contentRevision,
			});
			return true;
		}

		const titleError = validateTitle(body.title);
		if (titleError) {
			sendJson(res, 400, { message: titleError, code: 'validation_error' });
			return true;
		}
		const bodyError = validateBodyMarkdown(body.bodyMarkdown);
		if (bodyError) {
			sendJson(res, 400, { message: bodyError, code: 'validation_error' });
			return true;
		}
		const summaryError = validateSummary(body.summary);
		if (summaryError) {
			sendJson(res, 400, { message: summaryError, code: 'validation_error' });
			return true;
		}

		document.title = body.title;
		document.draftBodyMarkdown = body.bodyMarkdown.trim();
		document.draftSummary = body.summary?.trim() ? body.summary.trim() : null;
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
		return true;
	}

	return false;
}

function priorityRank(key: string): number {
	return findPriorityLevel(key)?.rank ?? 0;
}
