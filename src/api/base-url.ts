/**
 * Resolves the Document Routing API base URL for local mock vs Power Platform.
 * Prefer runtime injection (`window.__DOCUMENT_ROUTING_ENV__`) over Vite build-time env.
 */
import { resolveRuntimeHostConfig } from '@/config/runtime-config';

export function getApiBaseUrl(): string {
	const runtime = resolveRuntimeHostConfig();
	if (runtime.documentApiBaseUrl) {
		return runtime.documentApiBaseUrl;
	}

	return '/api';
}
