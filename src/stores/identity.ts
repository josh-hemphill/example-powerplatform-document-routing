/**
 * App-level Power Apps / standalone identity.
 * Single in-flight host context load; never trust request-body actor emails.
 */
import type { DocumentRoutingRole } from '@/domain/security-roles';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchPrincipal } from '@/api/fetch-principal';
import { LOCAL_DEMO_PERSONAS } from '@/config/local-personas';
import { resolveHostedRoles } from '@/domain/security-roles';

export { LOCAL_DEMO_PERSONAS } from '@/config/local-personas';
export type { DocumentRoutingRole } from '@/domain/security-roles';

export type IdentityStatus = 'loading' | 'hosted' | 'standalone' | 'failed';

export interface IdentityState {
	userId?: string;
	userName?: string;
	email?: string;
	environmentId?: string;
	/** Effective roles for UI gating (Dataverse security roles in production). */
	roles: DocumentRoutingRole[];
}

const HOST_CONTEXT_TIMEOUT_MS = 1_500;

let loadPromise: Promise<void> | null = null;

/**
 * Clears in-flight load state between vitest cases.
 */
export function resetIdentityLoadStateForTests(): void {
	loadPromise = null;
}

/**
 * Resolves whether the current build may use the local demo identity fallback.
 */
export function allowsDemoIdentityFallback(): boolean {
	return Boolean(import.meta.env.DEV);
}

type HostContextResult
	= | { kind: 'context'; context: {
		user?: {
			objectId?: string;
			fullName?: string;
			userPrincipalName?: string;
		};
		app?: { environmentId?: string };
	}; }
	| { kind: 'timeout' };

/**
 * Loads host context, distinguishing timeout from plugin failure.
 */
async function raceHostContext(): Promise<HostContextResult> {
	const { getContext } = await import('@microsoft/power-apps/app');
	return Promise.race([
		getContext().then((context) => ({ kind: 'context' as const, context })),
		new Promise<HostContextResult>((resolve) => {
			window.setTimeout(resolve, HOST_CONTEXT_TIMEOUT_MS, { kind: 'timeout' });
		}),
	]);
}

export const useIdentityStore = defineStore('identity', () => {
	const status = ref<IdentityStatus>('loading');
	const error = ref<string | null>(null);
	const identity = ref<IdentityState>({
		roles: ['user'],
	});

	const isLoading = computed(() => status.value === 'loading');
	const isReady = computed(
		() => status.value === 'hosted' || status.value === 'standalone',
	);
	const isHosted = computed(() => status.value === 'hosted');
	const email = computed(() => identity.value.email);
	const userName = computed(() => identity.value.userName);
	const canAct = computed(() => isReady.value && Boolean(identity.value.email));

	/**
	 * Loads host context once; subsequent callers await the same promise.
	 * Failed loads clear the in-flight promise so {@link retryLoad} can run.
	 */
	async function ensureLoaded(): Promise<void> {
		if (status.value === 'hosted' || status.value === 'standalone') {
			return;
		}
		if (!loadPromise) {
			loadPromise = loadContext().finally(() => {
				if (status.value === 'failed') {
					loadPromise = null;
				}
			});
		}
		await loadPromise;
	}

	/**
	 * Retries host context after a failed load.
	 */
	async function retryLoad(): Promise<void> {
		loadPromise = null;
		status.value = 'loading';
		error.value = null;
		await ensureLoaded();
	}

	/**
	 * Applies Dataverse security role names to a hosted identity (UI gating).
	 * No-op unless status is hosted.
	 */
	function applyHostedSecurityRoles(roleNames: readonly string[]): void {
		if (status.value !== 'hosted') {
			return;
		}
		identity.value = {
			...identity.value,
			roles: resolveHostedRoles(roleNames),
		};
	}

	/**
	 * Loads roles from GET /principal after host context (server-derived, not client headers).
	 */
	async function refreshHostedRoles(): Promise<void> {
		const actorEmail = identity.value.email;
		if (status.value !== 'hosted' || !actorEmail) {
			return;
		}
		try {
			const principal = await fetchPrincipal(actorEmail);
			if (principal.securityRoleNames?.length) {
				applyHostedSecurityRoles(principal.securityRoleNames);
				return;
			}
			if (principal.roles?.length) {
				identity.value = {
					...identity.value,
					roles: resolveHostedRoles(principal.roles),
				};
			}
		}
		catch {
			// Keep least-privilege user-only defaults when principal lookup is unavailable.
		}
	}

	async function loadContext(): Promise<void> {
		status.value = 'loading';
		error.value = null;

		try {
			const result = await raceHostContext();

			if (result.kind === 'timeout') {
				// Timeout is not "standalone" — never install demo identity on a slow host.
				status.value = 'failed';
				error.value = 'Power Apps host context timed out';
				identity.value = { roles: [] };
				return;
			}

			const hostContext = result.context;
			const hostEmail = hostContext.user?.userPrincipalName?.trim();
			if (!hostEmail) {
				status.value = 'failed';
				error.value = 'Host context did not include a user principal';
				identity.value = { roles: [] };
				return;
			}

			identity.value = {
				userId: hostContext.user?.objectId,
				userName: hostContext.user?.fullName,
				email: hostEmail,
				environmentId: hostContext.app?.environmentId,
				// Least privilege until GET /principal (or Dataverse) resolves roles.
				roles: resolveHostedRoles(null),
			};
			status.value = 'hosted';
			await refreshHostedRoles();
		}
		catch(loadError) {
			error.value
				= loadError instanceof Error ? loadError.message : 'Failed to load Power Apps context';
			if (!allowsDemoIdentityFallback()) {
				status.value = 'failed';
				identity.value = { roles: [] };
				return;
			}
			applyStandaloneDemo(LOCAL_DEMO_PERSONAS[0]);
		}
	}

	function applyStandaloneDemo(persona: (typeof LOCAL_DEMO_PERSONAS)[number]): void {
		identity.value = {
			userName: persona.userName,
			email: persona.email,
			roles: [...persona.roles],
		};
		status.value = 'standalone';
		error.value = null;
	}

	/**
	 * DEV/standalone only: switch the mock principal without spoofing per-request bodies.
	 */
	function switchLocalPersona(emailAddress: string): void {
		if (!allowsDemoIdentityFallback() || status.value === 'hosted') {
			return;
		}
		const persona = LOCAL_DEMO_PERSONAS.find(
			(item) => item.email.toLowerCase() === emailAddress.toLowerCase(),
		);
		if (!persona) {
			return;
		}
		applyStandaloneDemo(persona);
	}

	function hasRole(role: DocumentRoutingRole): boolean {
		return identity.value.roles.includes(role);
	}

	return {
		status,
		error,
		identity,
		isLoading,
		isReady,
		isHosted,
		email,
		userName,
		canAct,
		ensureLoaded,
		retryLoad,
		switchLocalPersona,
		applyHostedSecurityRoles,
		refreshHostedRoles,
		hasRole,
	};
});
