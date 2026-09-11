import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	hostActorEmail,
	resetIdentityLoadStateForTests,
	useIdentityStore,
} from './identity.ts';

const getContext = vi.fn();
const fetchPrincipal = vi.fn();

vi.mock('@microsoft/power-apps/app', () => ({
	getContext: () => getContext(),
}));

vi.mock('@/api/fetch-principal', () => ({
	fetchPrincipal: (...args: unknown[]) => fetchPrincipal(...args),
}));

describe('identity store', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		resetIdentityLoadStateForTests();
		getContext.mockReset();
		fetchPrincipal.mockReset();
		fetchPrincipal.mockRejectedValue(new Error('principal unavailable'));
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it('prefers userPrincipalName over a host email field', () => {
		expect(
			hostActorEmail({
				userPrincipalName: 'upn@contoso.com',
				email: 'mail@contoso.com',
			}),
		).toBe('upn@contoso.com');
		expect(hostActorEmail({ email: 'mail@contoso.com' })).toBe('mail@contoso.com');
		expect(hostActorEmail({ fullName: 'No Email' })).toBeUndefined();
	});

	it('defaults hosted principals to user-only when principal lookup fails', async() => {
		getContext.mockResolvedValue({
			user: {
				objectId: 'oid-1',
				fullName: 'Pat Hosted',
				userPrincipalName: 'pat@contoso.com',
			},
			app: { environmentId: 'env-1' },
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('hosted');
		expect(store.email).toBe('pat@contoso.com');
		expect(store.identity.roles).toEqual(['user']);
		expect(store.rolesUnresolved).toBe(true);
		expect(store.hasRole('publisher')).toBe(false);
		expect(store.hasRole('admin')).toBe(false);
		expect(fetchPrincipal).toHaveBeenCalledWith('pat@contoso.com');
	});

	it('loads hosted roles from GET /principal after host context', async() => {
		getContext.mockResolvedValue({
			user: {
				userPrincipalName: 'publisher@contoso.com',
				fullName: 'Pat Publisher',
			},
			app: { environmentId: 'env-1' },
		});
		fetchPrincipal.mockResolvedValue({
			email: 'publisher@contoso.com',
			roles: ['user', 'publisher'],
			securityRoleNames: [
				'Document Routing User',
				'Document Routing Publisher',
			],
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('hosted');
		expect(store.identity.roles).toEqual(['user', 'publisher']);
		expect(store.hasRole('publisher')).toBe(true);
		expect(store.hasRole('admin')).toBe(false);
	});

	it('applies Dataverse security role names on hosted identity', async() => {
		getContext.mockResolvedValue({
			user: {
				userPrincipalName: 'admin@contoso.com',
				fullName: 'Admin User',
			},
			app: { environmentId: 'env-1' },
		});

		const store = useIdentityStore();
		await store.ensureLoaded();
		store.applyHostedSecurityRoles([
			'Document Routing Publisher',
			'Document Routing Admin',
		]);

		expect(store.identity.roles).toEqual(['user', 'publisher', 'admin']);
		expect(store.hasRole('admin')).toBe(true);
	});

	it('falls back to demo identity on host context timeout in DEV', async() => {
		vi.useFakeTimers();
		getContext.mockImplementation(async() => new Promise(() => {}));

		const store = useIdentityStore();
		const pending = store.ensureLoaded();
		await vi.advanceTimersByTimeAsync(1_500);
		await pending;

		expect(store.status).toBe('standalone');
		expect(store.hasRole('admin')).toBe(true);
		expect(store.email).toBeTruthy();
		expect(fetchPrincipal).not.toHaveBeenCalled();
	});

	it('retries after a failed load when host later returns context', async() => {
		getContext.mockRejectedValueOnce(new Error('plugin missing'));

		const store = useIdentityStore();
		await store.ensureLoaded();
		expect(store.status).toBe('standalone');

		getContext.mockResolvedValue({
			user: { userPrincipalName: 'retry@contoso.com', fullName: 'Retry' },
			app: { environmentId: 'env' },
		});

		await store.retryLoad();
		expect(store.status).toBe('hosted');
		expect(store.email).toBe('retry@contoso.com');
		expect(store.identity.roles).toEqual(['user']);
		expect(fetchPrincipal).toHaveBeenCalledWith('retry@contoso.com');
	});

	it('falls back to demo identity when getContext rejects in DEV', async() => {
		getContext.mockRejectedValue(new Error('plugin missing'));

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('standalone');
		expect(store.hasRole('admin')).toBe(true);
		expect(store.email).toBeTruthy();
		expect(fetchPrincipal).not.toHaveBeenCalled();
	});

	it('falls back to demo identity when host context has no UPN in DEV', async() => {
		getContext.mockResolvedValue({
			user: { fullName: 'Incomplete Host' },
			app: { environmentId: 'env-1' },
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('standalone');
		expect(store.email).toBeTruthy();
		expect(store.hasRole('admin')).toBe(true);
		expect(fetchPrincipal).not.toHaveBeenCalled();
	});

	it('uses host email when userPrincipalName is missing in DEV', async() => {
		getContext.mockResolvedValue({
			user: {
				email: 'developer@example.com',
				fullName: 'Local Developer',
			},
			app: { environmentId: 'env-1' },
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('hosted');
		expect(store.email).toBe('developer@example.com');
		expect(store.hasRole('admin')).toBe(true);
	});

	it('applies local persona roles in DEV when hosted UPN matches a demo persona', async() => {
		getContext.mockResolvedValue({
			user: {
				userPrincipalName: 'developer@example.com',
				fullName: 'Local Developer',
			},
			app: { environmentId: 'env-1' },
		});
		// Even if principal would return user-only, matching persona wins in DEV.
		fetchPrincipal.mockResolvedValue({
			email: 'developer@example.com',
			roles: ['user'],
			securityRoleNames: ['Document Routing User'],
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('hosted');
		expect(store.email).toBe('developer@example.com');
		expect(store.hasRole('admin')).toBe(true);
		expect(store.rolesUnresolved).toBe(false);
		expect(fetchPrincipal).not.toHaveBeenCalled();
	});

	it('fails closed when host context has no UPN and DEV fallback is off', async() => {
		vi.stubEnv('DEV', false);
		getContext.mockResolvedValue({
			user: { fullName: 'Incomplete Host' },
			app: { environmentId: 'env-1' },
		});

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('failed');
		expect(store.error).toMatch(/user principal/i);
		expect(store.identity.email).toBeUndefined();
		vi.unstubAllEnvs();
	});

	it('does not install demo identity on timeout when DEV fallback is off', async() => {
		vi.stubEnv('DEV', false);
		vi.useFakeTimers();
		getContext.mockImplementation(async() => new Promise(() => {}));

		const store = useIdentityStore();
		const pending = store.ensureLoaded();
		await vi.advanceTimersByTimeAsync(1_500);
		await pending;

		expect(store.status).toBe('failed');
		expect(store.error).toMatch(/timed out/i);
		expect(store.identity.email).toBeUndefined();
		expect(store.identity.roles).toEqual([]);
		vi.unstubAllEnvs();
	});
});
