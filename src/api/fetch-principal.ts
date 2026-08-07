import type { DocumentRoutingRole } from '@/domain/security-roles';
/**
 * Fetches caller principal roles without the HeyAPI interceptor (avoids ensureLoaded cycles).
 */
import { getApiBaseUrl } from '@/api/base-url';

export interface PrincipalResponse {
	email: string;
	roles: DocumentRoutingRole[];
	securityRoleNames?: string[];
}

/**
 * Loads principal roles for the given actor from GET /principal.
 * Sends only the actor header — the server must derive roles (mock ignores Roles header).
 */
export async function fetchPrincipal(
	actorEmail: string,
): Promise<PrincipalResponse> {
	const base = getApiBaseUrl().replace(/\/$/, '');
	const response = await fetch(`${base}/principal`, {
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'X-Document-Routing-Actor': actorEmail,
		},
	});
	if (!response.ok) {
		throw new Error(`Principal lookup failed (${response.status})`);
	}
	return (await response.json()) as PrincipalResponse;
}
