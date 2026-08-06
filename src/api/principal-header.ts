/**
 * Attaches the authenticated principal to API requests (mock header stand-in).
 *
 * `X-Document-Routing-Actor` and `X-Document-Routing-Roles` are **local mock only**.
 * Production Custom Connectors / Dataverse must derive the caller and security roles
 * from the token and **must ignore** these headers as a trust boundary.
 */
import { client } from '@/client/client.gen';
import { useIdentityStore } from '@/stores/identity';

const ACTOR_HEADER = 'X-Document-Routing-Actor';
const ROLES_HEADER = 'X-Document-Routing-Roles';

/**
 * Registers a request interceptor that sets the principal header from the identity store.
 * Waits for identity to finish loading so early list/get calls do not omit the header.
 */
export function installPrincipalHeaderInterceptor(): void {
	client.interceptors.request.use(async(request) => {
		const store = useIdentityStore();
		await store.ensureLoaded();
		const email = store.email;
		if (email) {
			request.headers.set(ACTOR_HEADER, email);
		}
		else {
			request.headers.delete(ACTOR_HEADER);
		}
		const roles = store.identity.roles;
		if (roles.length > 0) {
			request.headers.set(ROLES_HEADER, roles.join(','));
		}
		else {
			request.headers.delete(ROLES_HEADER);
		}
		return request;
	});
}
