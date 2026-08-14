/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEV: boolean;
	readonly MODE: string;
	readonly PROD: boolean;
	readonly SSR: boolean;
	readonly VITE_DOCUMENT_API_BASE_URL?: string;
	/** SharePoint site URL — any HTTPS host (vanity / custom domains supported). */
	readonly VITE_SHAREPOINT_SITE_URL?: string;
	readonly VITE_SHAREPOINT_LIBRARY_NAME?: string;
	readonly VITE_SHAREPOINT_FOLDER_PATH?: string;
	/** Dataverse org URL — any HTTPS host (custom domains supported). */
	readonly VITE_DATAVERSE_ENVIRONMENT_URL?: string;
	/** Local Vite DEV identity overrides (ignored when hosted in Power Apps). */
	readonly VITE_LOCAL_DEMO_EMAIL?: string;
	readonly VITE_LOCAL_DEMO_USER_NAME?: string;
	/** Comma-separated role tokens or Dataverse display names (must include admin for `#/admin`). */
	readonly VITE_LOCAL_DEMO_ROLES?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
