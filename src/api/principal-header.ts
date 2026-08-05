/**
 * Attaches the authenticated principal to API requests (mock header stand-in).
 */
import { client } from '@/client/client.gen';
import { useIdentityStore } from '@/stores/identity';

const ACTOR_HEADER = 'X-Document-Routing-Actor';

/**
 * Registers a request interceptor that sets the principal header from the identity store.
 */
export function installPrincipalHeaderInterceptor(): void {
	client.interceptors.request.use((request) => {
		const store = useIdentityStore();
		const email = store.email;
		if (email) {
			request.headers.set(ACTOR_HEADER, email);
		}
		else {
			request.headers.delete(ACTOR_HEADER);
		}
		return request;
	});
}
