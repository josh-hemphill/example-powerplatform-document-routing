/**
 * Resolves the Document Routing API base URL for local mock vs Power Platform.
 * Prefer runtime injection (`window.__DOCUMENT_ROUTING_ENV__`) over Vite build-time env.
 */
import { resolveRuntimeHostConfig } from '@/config/runtime-config';

const LOCAL_MOCK_BASE = '/api';

export function getApiBaseUrl(): string {
	const runtime = resolveRuntimeHostConfig();
	if (runtime.documentApiBaseUrl) {
		return runtime.documentApiBaseUrl;
	}

	const fromVite = readViteDocumentApiBaseUrl();
	if (fromVite) {
		return fromVite;
	}

	return LOCAL_MOCK_BASE;
}

/**
 * Fails loudly when a production build still targets the local Vite mock path.
 * DEV always allows `/api` (mock plugin). Hosted apps must inject a real base URL.
 */
export function assertProductionApiBaseUrl(
	baseUrl: string = getApiBaseUrl(),
	options: { isProduction?: boolean } = {},
): void {
	const isProd = options.isProduction ?? Boolean(import.meta.env?.PROD);
	if (!isProd) {
		return;
	}
	const normalized = baseUrl.replace(/\/+$/, '') || '/';
	if (normalized === LOCAL_MOCK_BASE || normalized.endsWith(LOCAL_MOCK_BASE)) {
		throw new Error(
			'Production build is still pointing at the local mock API (/api). '
			+ 'Inject window.__DOCUMENT_ROUTING_ENV__.documentApiBaseUrl (or VITE_DOCUMENT_API_BASE_URL) '
			+ 'before mounting the app.',
		);
	}
}

function readViteDocumentApiBaseUrl(): string | undefined {
	try {
		const meta = import.meta as ImportMeta & {
			env?: Record<string, string | undefined>;
		};
		const value = meta.env?.VITE_DOCUMENT_API_BASE_URL?.trim();
		return value || undefined;
	}
	catch {
		return undefined;
	}
}
