/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOCUMENT_API_BASE_URL?: string
  /** SharePoint site URL — any HTTPS host (vanity / custom domains supported). */
  readonly VITE_SHAREPOINT_SITE_URL?: string
  readonly VITE_SHAREPOINT_LIBRARY_NAME?: string
  readonly VITE_SHAREPOINT_FOLDER_PATH?: string
  /** Dataverse org URL — any HTTPS host (custom domains supported). */
  readonly VITE_DATAVERSE_ENVIRONMENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
