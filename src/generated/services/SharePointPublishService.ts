/**
 * Example of the typed SharePoint service shape produced by:
 * `pnpm exec pa app add data-source --connector shared_sharepointonline ...`
 *
 * Replace this stub with the generated service under `src/generated/services`
 * once a real SharePoint connection is added to the Code App.
 */
export interface SharePointFileCreateRequest {
  siteUrl: string
  libraryName: string
  folderPath: string
  fileName: string
  contentBase64: string
  contentType?: string
}

export interface SharePointFileCreateResult {
  itemId: string
  webUrl: string
}

export const SharePointPublishService = {
  /**
   * Uploads a rendered PDF into a SharePoint document library.
   * In production this calls the generated SharePoint connector or a flow.
   */
  async createFile(
    request: SharePointFileCreateRequest,
  ): Promise<SharePointFileCreateResult> {
    if (import.meta.env.DEV) {
      return {
        itemId: crypto.randomUUID(),
        webUrl: `${request.siteUrl.replace(/\/$/, '')}/${encodeURIComponent(request.libraryName)}${request.folderPath}/${request.fileName}`,
      }
    }

    throw new Error(
      'SharePointPublishService stub is not connected. Add the SharePoint data source with the Power Apps CLI and regenerate services.',
    )
  },
}
