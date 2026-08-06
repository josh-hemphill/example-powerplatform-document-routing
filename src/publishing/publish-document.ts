import type { PublishableDocument } from '@/publishing/html-pdf-template';

export interface PublishCommandInput {
	document: PublishableDocument;
	publishDestinationId?: string;
	folderPathOverride?: string;
	/**
	 * Calls the generated OpenAPI publish mutation (mock or Custom Connector → Flow).
	 * Never uploads PDF bytes from the browser.
	 */
	publishApi: (body: {
		publishDestinationId?: string;
		folderPathOverride?: string;
	}) => Promise<{
		sharePointUrl: string;
		pdfFileName: string;
		sharePointItemId?: string;
		idempotent?: boolean;
	}>;
}

export interface PublishCommandResult {
	pdfFileName: string;
	sharePointUrl: string;
	sharePointItemId?: string;
	idempotent: boolean;
}

/**
 * Starts trusted publish via API/Flow. Does not render or upload PDF bytes in-browser.
 */
export async function publishApprovedDocument(
	input: PublishCommandInput,
): Promise<PublishCommandResult> {
	if (input.document.status !== 'approved' && input.document.status !== 'published') {
		throw new Error('Only approved documents can be published');
	}

	const published = await input.publishApi({
		publishDestinationId: input.publishDestinationId,
		folderPathOverride: input.folderPathOverride,
	});

	return {
		pdfFileName: published.pdfFileName,
		sharePointUrl: published.sharePointUrl,
		sharePointItemId: published.sharePointItemId,
		idempotent: Boolean(published.idempotent),
	};
}
