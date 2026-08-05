import { SharePointPublishService } from '@/generated/services/SharePointPublishService'
import {
  buildPdfFileName,
  renderDocumentHtml,
  resolvePublishTargets,
  type PublishableDocument,
} from '@/publishing/html-pdf-template'
import type { SharePointDefaults } from '@/config/app.config'

export interface PublishOrchestratorInput {
  document: PublishableDocument
  targets?: Partial<SharePointDefaults & { fileName?: string }>
  /**
   * Calls the generated OpenAPI publish mutation (or mock) after preparing HTML.
   */
  publishApi: (body: {
    sharePointSiteUrl: string
    libraryName: string
    folderPath?: string
    fileName?: string
  }) => Promise<{
    sharePointUrl: string
    pdfFileName: string
    sharePointItemId?: string
  }>
}

export interface PublishOrchestratorResult {
  html: string
  pdfFileName: string
  sharePointUrl: string
  sharePointItemId?: string
  connectorPreviewItemId: string
}

/**
 * Prepares HTML, previews the SharePoint connector stub, then calls the publish API.
 * Swap `renderDocumentHtml` or `SharePointPublishService` without touching the view.
 */
export async function publishApprovedDocument(
  input: PublishOrchestratorInput,
): Promise<PublishOrchestratorResult> {
  const targets = resolvePublishTargets(input.document, input.targets)
  const html = renderDocumentHtml(input.document)
  const pdfFileName = targets.fileName || buildPdfFileName(input.document.title)

  // Browser-safe stand-in for PDF bytes until a server renderer is wired.
  const bytes = new TextEncoder().encode(html)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const contentBase64 = btoa(binary)
  const connectorPreview = await SharePointPublishService.createFile({
    siteUrl: targets.siteUrl,
    libraryName: targets.libraryName,
    folderPath: targets.folderPath,
    fileName: pdfFileName,
    contentBase64,
    contentType: 'application/pdf',
  })

  const published = await input.publishApi({
    sharePointSiteUrl: targets.siteUrl,
    libraryName: targets.libraryName,
    folderPath: targets.folderPath,
    fileName: pdfFileName,
  })

  return {
    html,
    pdfFileName: published.pdfFileName,
    sharePointUrl: published.sharePointUrl,
    sharePointItemId: published.sharePointItemId,
    connectorPreviewItemId: connectorPreview.itemId,
  }
}
