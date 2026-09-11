/**
 * Runtime host configuration.
 * Local Vite uses `VITE_*` at build time. Hosted Code Apps should prefer
 * Power Platform / Dataverse environment variables (`{publisherPrefix}_*`, e.g. `dr_*`)
 * injected at runtime (see deploy/generated/environment-variable-values.md and SUMMARY).
 */

export interface RuntimeHostConfig {
	documentApiBaseUrl?: string;
	sharePointSiteUrl?: string;
	sharePointLibraryName?: string;
	sharePointFolderPath?: string;
	dataverseEnvironmentUrl?: string;
	/** Where values were resolved from (for setup diagnostics). */
	source: 'runtime-injection' | 'vite-env' | 'defaults';
}

declare global {
	interface Window {
		/** Optional runtime injection for hosted Code Apps (Dataverse env vars). */
		__DOCUMENT_ROUTING_ENV__?: Partial<
			Omit<RuntimeHostConfig, 'source'>
		>;
	}
}

function trimOrUndefined(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readViteEnv(): Pick<
	RuntimeHostConfig,
	| 'documentApiBaseUrl'
	| 'sharePointSiteUrl'
	| 'sharePointLibraryName'
	| 'sharePointFolderPath'
	| 'dataverseEnvironmentUrl'
> {
	return {
		documentApiBaseUrl: trimOrUndefined(import.meta.env?.VITE_DOCUMENT_API_BASE_URL),
		sharePointSiteUrl: trimOrUndefined(import.meta.env?.VITE_SHAREPOINT_SITE_URL),
		sharePointLibraryName: trimOrUndefined(import.meta.env?.VITE_SHAREPOINT_LIBRARY_NAME),
		sharePointFolderPath: trimOrUndefined(import.meta.env?.VITE_SHAREPOINT_FOLDER_PATH),
		dataverseEnvironmentUrl: trimOrUndefined(import.meta.env?.VITE_DATAVERSE_ENVIRONMENT_URL),
	};
}

/**
 * Resolves API / SharePoint hosts: runtime injection first, then Vite env.
 */
export function resolveRuntimeHostConfig(): RuntimeHostConfig {
	const injected = typeof window !== 'undefined' ? window.__DOCUMENT_ROUTING_ENV__ : undefined;
	if (injected && Object.keys(injected).length > 0) {
		return {
			documentApiBaseUrl: trimOrUndefined(injected.documentApiBaseUrl),
			sharePointSiteUrl: trimOrUndefined(injected.sharePointSiteUrl),
			sharePointLibraryName: trimOrUndefined(injected.sharePointLibraryName),
			sharePointFolderPath: trimOrUndefined(injected.sharePointFolderPath),
			dataverseEnvironmentUrl: trimOrUndefined(injected.dataverseEnvironmentUrl),
			source: 'runtime-injection',
		};
	}

	const fromVite = readViteEnv();

	const hasVite = Object.values(fromVite).some(Boolean);
	return {
		...fromVite,
		source: hasVite ? 'vite-env' : 'defaults',
	};
}
