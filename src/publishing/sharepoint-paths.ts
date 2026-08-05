/**
 * Normalizes a SharePoint folder path to '' or '/Segment/...'.
 */
export function normalizeSharePointFolderPath(
  folderPath: string | null | undefined,
): string {
  const trimmed = (folderPath ?? '').trim()
  if (!trimmed || trimmed === '/') {
    return ''
  }

  const withoutEdgeSlashes = trimmed.replace(/^\/+|\/+$/g, '')
  if (!withoutEdgeSlashes) {
    return ''
  }

  return `/${withoutEdgeSlashes}`
}

/**
 * Builds a SharePoint-like document URL from site, library, folder, and file.
 */
export function buildSharePointDocumentUrl(input: {
  siteUrl: string
  libraryName: string
  folderPath?: string | null
  fileName: string
}): string {
  const site = input.siteUrl.replace(/\/+$/, '')
  const library = encodeURIComponent(input.libraryName)
  const folder = normalizeSharePointFolderPath(input.folderPath)
  const encodedFolder = folder
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const file = encodeURIComponent(input.fileName.replace(/^\/+/, ''))
  return `${site}/${library}${encodedFolder ? `/${encodedFolder}` : ''}/${file}`
}
