import type { CreateClientConfig } from '../client/client.gen';
import { getApiBaseUrl } from './base-url';

/**
 * Configures the HeyAPI fetch client for local mock or Power Platform hosts.
 * Actor identity is attached later via `installPrincipalHeaderInterceptor`.
 */
export const createClientConfig: CreateClientConfig = (config) => ({
	...config,
	baseUrl: getApiBaseUrl(),
});
