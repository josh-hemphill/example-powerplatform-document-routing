/**
 * Resolves the Document Routing API base URL for local mock vs Power Platform.
 */
export function getApiBaseUrl(): string {
	const fromEnv = import.meta.env.VITE_DOCUMENT_API_BASE_URL;
	if (typeof fromEnv === 'string' && fromEnv.length > 0) {
		return fromEnv;
	}

	return '/api';
}
