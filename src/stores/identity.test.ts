import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	resetIdentityLoadStateForTests,
	useIdentityStore,
} from './identity.ts';

const getContext = vi.fn();

vi.mock('@microsoft/power-apps/app', () => ({
	getContext: () => getContext(),
}));

describe('identity store', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		resetIdentityLoadStateForTests();
		getContext.mockReset();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('defaults hosted principals to user-only roles', async() => {
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
		expect(store.hasRole('publisher')).toBe(false);
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
		getContext.mockImplementation(() => new Promise(() => {}));

		const store = useIdentityStore();
		const pending = store.ensureLoaded();
		await vi.advanceTimersByTimeAsync(1_500);
		await pending;

		expect(store.status).toBe('failed');
		expect(store.error).toMatch(/timed out/i);
		expect(store.identity.email).toBeUndefined();
		expect(store.identity.roles).toEqual([]);
	});

	it('retries after a failed load', async() => {
		vi.useFakeTimers();
		getContext.mockImplementation(() => new Promise(() => {}));

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
	});

	it('falls back to demo identity when getContext rejects in DEV', async() => {
		getContext.mockRejectedValue(new Error('plugin missing'));

		const store = useIdentityStore();
		await store.ensureLoaded();

		expect(store.status).toBe('standalone');
		expect(store.hasRole('admin')).toBe(true);
		expect(store.email).toBeTruthy();
	});
});
