import type { MockHttpContext } from '../http.ts';
import { randomUUID } from 'node:crypto';
import { canActorPublishDocument } from '../../domain/document-authz.ts';
import {
	PublishValidationError,
	resolveTrustedPublishTarget,
} from '../../publishing/publish-engine.ts';
import { buildSharePointDocumentUrl } from '../../publishing/sharepoint-paths.ts';
import {
	allocateNextDocumentNumber,
	findControlDocumentType,
	getControlStore,
	recordFlowRun,
} from '../control-store.ts';
import { pushHistory } from '../document-http.ts';
import { getDocumentStore } from '../document-store.ts';
import { applySupersessionOnPublish } from '../supersede-engine.ts';

export async function handlePublishRoutes(context: MockHttpContext): Promise<boolean> {
	const {
		method,
		path,
		actor,
		actorRoles,
		req,
		res,
		readJson,
		sendJson,
		matchRoute,
		stamp,
	} = context;

	const publishMatch = matchRoute(
		path,
		/^\/api\/documents\/([^/]+)\/publish$/,
	);
	if (method !== 'POST' || !publishMatch) {
		return false;
	}

	const document = getDocumentStore().get(publishMatch[1]);
	if (!document) {
		sendJson(res, 404, { message: 'Document not found', code: 'not_found' });
		return true;
	}

	if (!canActorPublishDocument(document, actor, actorRoles)) {
		sendJson(res, 403, {
			message:
				'Publisher or Admin role and document access required to publish',
			code: 'forbidden',
		});
		return true;
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
				publishedAt: document.publishedAt,
				idempotent: true,
			});
			return true;
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
				return true;
			}
			if (!prior.documentNumber?.trim()) {
				sendJson(res, 409, {
					message:
						'Prior published document is missing a controlled document number',
					code: 'invalid_state',
				});
				return true;
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
				return true;
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
			publishedAt,
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
			return true;
		}
		throw error;
	}
	return true;
}
