import type { MockHttpContext } from '../http.ts';
import type { MockDocumentRecord } from '../seed-documents.ts';
import { randomUUID } from 'node:crypto';
import {
	validateBodyMarkdown,
	validateFreeformRequest,
	validateSummary,
	validateTitle,
} from '../../api/form-rules.ts';
import { matchesInboxPersona } from '../../config/inbox-personas.ts';
import { resolvePrincipalRolesByEmail } from '../../config/local-personas.ts';
import {
	canActorAccessDocument,
	canActorMutateDraft,
	isDraftEditableStatus,
} from '../../domain/document-access.ts';
import {
	findControlDocumentType,
	toDocumentTypeDefinition,
} from '../control-store.ts';
import { pushHistory, toSummary } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';
import { paginateItems, parseListPagination } from '../list-pagination.ts';

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
		const persona = url.searchParams.get('persona') ?? 'all';
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
		if (persona && persona !== 'all') {
			records = records.filter((document) =>
				matchesInboxPersona(toSummary(document), persona as never, actor, roles));
		}

		records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		const page = paginateItems(records.map(toSummary), offset, limit);
		sendJson(res, 200, page);
		return true;
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

	const draftMatch = matchRoute(path, /^\/api\/documents\/([^/]+)\/draft$/);
	if (method === 'PUT' && draftMatch) {
		const document = getDocumentStore().get(draftMatch[1]);
		if (!document) {
			sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
			return true;
		}
		if (!isDraftEditableStatus(document.status)) {
			sendJson(res, 409, {
				message: 'Draft can only be edited while requested or drafting',
				code: 'invalid_state',
			});
			return true;
		}
		if (!canActorMutateDraft(document, actor)) {
			sendJson(res, 403, {
				message:
					'Only shared authors/requesters can edit drafts in requested/drafting',
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
