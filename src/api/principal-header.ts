/**
 * Attaches the authenticated principal to API requests (mock header stand-in).
 */
import { client } from '@/client/client.gen';
import { useIdentityStore } from '@/stores/identity';

const ACTOR_HEADER = 'X-Document-Routing-Actor';

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
		return request;
	});
}
