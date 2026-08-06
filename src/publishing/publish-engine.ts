/**
 * Trusted publish helpers: allowlisted destinations, revision filenames, idempotency.
 * PDF bytes are created server-side / by Flow — never uploaded from the browser.
 */
import { normalizeSharePointFolderPath } from './sharepoint-paths.ts';

export interface PublishDestinationRef {
	id: string;
	name: string;
	siteUrl: string;
	libraryName: string;
	folderPath: string;
	active: boolean;
}

export interface PublishableRevision {
	id: string;
	title: string;
	status: string;
	contentRevision: number;
	submittedContentRevision?: number | null;
	publishedContentRevision?: number | null;
	publishedPdfUrl?: string | null;
	sharePointItemId?: string | null;
	defaultDestinationId?: string | null;
}

/**
 * Builds a stable PDF file name including document id and content revision.
 * Same revision → same name (safe for idempotent retries); new revision → new name.
 */
export function buildRevisionPdfFileName(
	documentId: string,
	contentRevision: number,
	title?: string,
): string {
	const slug = (title ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
	const idPart = documentId.replace(/[^a-z0-9-]/gi, '').slice(0, 8) || 'doc';
	const rev = Number.isFinite(contentRevision) ? Math.max(0, Math.trunc(contentRevision)) : 0;
	const prefix = slug || 'document';
	return `${prefix}-${idPart}-r${rev}.pdf`;
}

/**
 * Revision frozen for publish (submitted snapshot, else current content revision).
 */
export function resolvePublishRevision(document: PublishableRevision): number {
	if (
		document.submittedContentRevision != null
		&& Number.isFinite(document.submittedContentRevision)
	) {
		return document.submittedContentRevision;
	}
	return document.contentRevision;
}

/**
 * True when this revision was already published (idempotent republish).
 */
export function isSameRevisionAlreadyPublished(document: PublishableRevision): boolean {
	if (document.status !== 'published' || !document.publishedPdfUrl) {
		return false;
	}
	const revision = resolvePublishRevision(document);
	return document.publishedContentRevision === revision;
}

/**
 * True when folderOverride stays within the allowlisted destination folder root.
 * Dot-segments (`..` / `.`) are canonicalized; escapes above the library root fail.
 */
export function isFolderWithinDestinationRoot(
	destinationFolder: string,
	folderOverride: string | null | undefined,
): boolean {
	if (folderOverride == null || folderOverride === '') {
		return true;
	}
	const root = canonicalizeFolderPath(destinationFolder);
	const override = canonicalizeFolderPath(folderOverride);
	if (root == null || override == null) {
		return false;
	}
	if (root === '/') {
		return true;
	}
	return override === root || override.startsWith(`${root}/`);
}

/**
 * Collapses `.` / `..` folder segments. Returns null when `..` escapes the library root.
 */
export function canonicalizeFolderPath(folderPath: string): string | null {
	const normalized = normalizeSharePointFolderPath(folderPath);
	if (!normalized) {
		return '/';
	}
	const stack: string[] = [];
	for (const segment of normalized.split('/').filter(Boolean)) {
		if (segment === '.') {
			continue;
		}
		if (segment === '..') {
			if (stack.length === 0) {
				return null;
			}
			stack.pop();
			continue;
		}
		stack.push(segment);
	}
	return stack.length > 0 ? `/${stack.join('/')}` : '/';
}

export interface ResolvedPublishTarget {
	destination: PublishDestinationRef;
	folderPath: string;
	fileName: string;
	revision: number;
	idempotent: boolean;
}

export class PublishValidationError extends Error {
	code: 'validation_error' | 'invalid_state' | 'forbidden';

	constructor(
		message: string,
		code: PublishValidationError['code'] = 'validation_error',
	) {
		super(message);
		this.code = code;
	}
}

/**
 * Resolves a trusted publish target from the allowlist (never trusts free-form site URLs).
 */
export function resolveTrustedPublishTarget(input: {
	document: PublishableRevision;
	destinations: PublishDestinationRef[];
	publishDestinationId?: string | null;
	folderPathOverride?: string | null;
}): ResolvedPublishTarget {
	const { document, destinations } = input;
	if (document.status !== 'approved' && document.status !== 'published') {
		throw new PublishValidationError(
			'Only approved documents can be published',
			'invalid_state',
		);
	}

	const revision = resolvePublishRevision(document);
	if (isSameRevisionAlreadyPublished(document)) {
		const destination
			= destinations.find((item) => item.id === input.publishDestinationId)
				?? destinations.find((item) => item.id === document.defaultDestinationId)
				?? destinations.find((item) => item.active);
		if (!destination) {
			throw new PublishValidationError('No publish destination available');
		}
		return {
			destination,
			folderPath: destination.folderPath,
			fileName: buildRevisionPdfFileName(document.id, revision, document.title),
			revision,
			idempotent: true,
		};
	}

	const destinationId
		= input.publishDestinationId?.trim()
			|| document.defaultDestinationId
			|| null;
	if (!destinationId) {
		throw new PublishValidationError(
			'publishDestinationId is required (or set a default on the document type)',
		);
	}

	const destination = destinations.find((item) => item.id === destinationId);
	if (!destination || !destination.active) {
		throw new PublishValidationError(
			'Publish destination is unknown or inactive',
		);
	}

	if (!/^https:\/\//i.test(destination.siteUrl)) {
		throw new PublishValidationError('Publish destination siteUrl must be HTTPS');
	}

	const folderPath
		= input.folderPathOverride?.trim()
			? input.folderPathOverride
			: destination.folderPath;

	if (!isFolderWithinDestinationRoot(destination.folderPath, folderPath)) {
		throw new PublishValidationError(
			'folderPathOverride must stay under the allowlisted destination folder',
		);
	}

	const canonicalFolder = canonicalizeFolderPath(folderPath);
	if (canonicalFolder == null) {
		throw new PublishValidationError(
			'folderPathOverride must stay under the allowlisted destination folder',
		);
	}

	return {
		destination,
		folderPath: canonicalFolder === '/' ? destination.folderPath : canonicalFolder,
		fileName: buildRevisionPdfFileName(document.id, revision, document.title),
		revision,
		idempotent: false,
	};
}
