import type { MockHttpContext } from '../http.ts';
import { resolvePrincipalRolesByEmail } from '../../config/local-personas.ts';
import { toDataverseSecurityRoleNames } from '../../domain/security-roles.ts';

export function handlePrincipalRoute(context: MockHttpContext): boolean {
	const { method, path, actor, res, sendJson } = context;
	if (method !== 'GET' || path !== '/api/principal') {
		return false;
	}

	const roles = resolvePrincipalRolesByEmail(actor);
	sendJson(res, 200, {
		email: actor,
		roles,
		securityRoleNames: toDataverseSecurityRoleNames(roles),
	});
	return true;
}
