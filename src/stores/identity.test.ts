import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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

	it('fails on host context timeout without installing demo identity', async() => {
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
		expect(fetchPrincipal).not.toHaveBeenCalled();
	});

	it('retries after a failed load', async() => {
		vi.useFakeTimers();
		getContext.mockImplementation(async() => new Promise(() => {}));

		const store = useIdentityStore();
		const first = store.ensureLoaded();
		await vi.advanceTimersByTimeAsync(1_500);
		await first;
		expect(store.status).toBe('failed');

		vi.useRealTimers();
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
});
