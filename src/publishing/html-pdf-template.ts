import type { SharePointDefaults } from '@/config/app.config';
import { appConfig } from '@/config/app.config';
import { getDocumentType } from '@/config/document-types';

export interface PublishableDocument {
	id: string;
	title: string;
	documentType?: string | null;
	freeformRequest: string;
	draftBodyMarkdown?: string | null;
	draftSummary?: string | null;
	requesterEmail: string;
	authorEmail?: string | null;
	requestedPublishSiteUrl?: string | null;
	requestedLibraryName?: string | null;
}

/**
 * Builds a stable PDF file name from a document title.
 */
export function buildPdfFileName(title: string): string {
	const slug = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `${slug || 'document'}.pdf`;
}

/**
 * Resolves SharePoint publish targets from document + app/type defaults.
 */
export function resolvePublishTargets(
	document: PublishableDocument,
	overrides?: Partial<SharePointDefaults & { fileName?: string }>,
): SharePointDefaults & { fileName: string } {
	const type = getDocumentType(document.documentType);
	return {
		siteUrl:
      overrides?.siteUrl
      || document.requestedPublishSiteUrl
      || appConfig.sharePoint.siteUrl,
		libraryName:
      overrides?.libraryName
      || document.requestedLibraryName
      || appConfig.sharePoint.libraryName,
		folderPath:
      overrides?.folderPath
      || type.folderPath
      || appConfig.sharePoint.folderPath,
		fileName: overrides?.fileName || buildPdfFileName(document.title),
	};
}

/**
 * Renders an HTML document suitable for server-side HTML→PDF conversion.
 * Customize layout/CSS here; keep PDF engines (Playwright, etc.) on the server.
 */
export function renderDocumentHtml(document: PublishableDocument): string {
	const type = getDocumentType(document.documentType);
	const body = document.draftBodyMarkdown ?? document.freeformRequest;
	const summary = document.draftSummary
		? `<p class="summary">${escapeHtml(document.draftSummary)}</p>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: #102a43;
      line-height: 1.55;
      margin: 48px;
      max-width: 800px;
    }
    .eyebrow { color: #486581; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    h1 { font-size: 28px; margin: 8px 0 16px; }
    .meta { color: #486581; font-size: 13px; margin-bottom: 24px; }
    .summary { background: #f0f4f8; padding: 12px 16px; border-radius: 8px; }
    pre {
      white-space: pre-wrap;
      font-family: inherit;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="eyebrow">${escapeHtml(type.label)} · ${escapeHtml(appConfig.brand.name)}</div>
  <h1>${escapeHtml(document.title)}</h1>
  <div class="meta">
    Requester: ${escapeHtml(document.requesterEmail)}
    ${document.authorEmail ? ` · Author: ${escapeHtml(document.authorEmail)}` : ''}
  </div>
  ${summary}
  <pre>${escapeHtml(body)}</pre>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
