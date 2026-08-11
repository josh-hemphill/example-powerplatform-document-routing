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

function readViteEnv(key: string): string | undefined {
	try {
		const meta = import.meta as ImportMeta & {
			env?: Record<string, string | undefined>;
		};
		return trimOrUndefined(meta.env?.[key]);
	}
	catch {
		return undefined;
	}
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

	const fromVite = {
		documentApiBaseUrl: readViteEnv('VITE_DOCUMENT_API_BASE_URL'),
		sharePointSiteUrl: readViteEnv('VITE_SHAREPOINT_SITE_URL'),
		sharePointLibraryName: readViteEnv('VITE_SHAREPOINT_LIBRARY_NAME'),
		sharePointFolderPath: readViteEnv('VITE_SHAREPOINT_FOLDER_PATH'),
		dataverseEnvironmentUrl: readViteEnv('VITE_DATAVERSE_ENVIRONMENT_URL'),
	};

	const hasVite = Object.values(fromVite).some(Boolean);
	return {
		...fromVite,
		source: hasVite ? 'vite-env' : 'defaults',
	};
}
