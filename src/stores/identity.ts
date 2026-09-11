/**
 * App-level Power Apps / standalone identity.
 * Single in-flight host context load; never trust request-body actor emails.
 */
import type { DocumentRoutingRole } from '@/domain/security-roles';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchPrincipal } from '@/api/fetch-principal';
import {
	isKnownLocalDemoEmail,
	LOCAL_DEMO_PERSONAS,
	resolvePrincipalRolesByEmail,
} from '@/config/local-personas';
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

type HostUserContext = {
	objectId?: string;
	fullName?: string;
	userPrincipalName?: string;
	email?: string;
};

type HostContextResult
	= | { kind: 'context'; context: {
		user?: HostUserContext;
		app?: { environmentId?: string };
	}; }
	| { kind: 'timeout' }
	| { kind: 'error'; error: unknown };

/**
 * Prefers the Power Apps UPN, then a host `email` field if a host only sends that.
 */
export function hostActorEmail(user: HostUserContext | undefined): string | undefined {
	const upn = user?.userPrincipalName?.trim();
	if (upn) {
		return upn;
	}
	const email = user?.email?.trim();
	return email || undefined;
}

export type HostedRolesStatus = 'idle' | 'loading' | 'resolved' | 'failed';

/**
 * Loads host context, distinguishing timeout from plugin failure.
 * Always settles the host promise so a late rejection cannot be unhandled.
 */
async function raceHostContext(): Promise<HostContextResult> {
	const { getContext } = await import('@microsoft/power-apps/app');
	const hostPromise = getContext()
		.then((context) => ({ kind: 'context' as const, context }))
		.catch((error: unknown) => ({ kind: 'error' as const, error }));
	return Promise.race([
		hostPromise,
		new Promise<HostContextResult>((resolve) => {
			window.setTimeout(resolve, HOST_CONTEXT_TIMEOUT_MS, { kind: 'timeout' });
		}),
	]);
}

export const useIdentityStore = defineStore('identity', () => {
	const status = ref<IdentityStatus>('loading');
	const error = ref<string | null>(null);
	const hostedRolesStatus = ref<HostedRolesStatus>('idle');
	const identity = ref<IdentityState>({
		roles: ['user'],
	});
	/** Host principal captured before a DEV Acting-as overlay (Local Play). */
	const hostedIdentitySnapshot = ref<IdentityState | null>(null);

	const isLoading = computed(() => status.value === 'loading');
	const isReady = computed(
		() => status.value === 'hosted' || status.value === 'standalone',
	);
	const isHosted = computed(() => status.value === 'hosted');
	const email = computed(() => identity.value.email);
	const userName = computed(() => identity.value.userName);
	const canAct = computed(() => isReady.value && Boolean(identity.value.email));
	/** True when hosted role lookup finished successfully (or standalone demo). */
	const rolesResolved = computed(
		() =>
			status.value === 'standalone'
			|| hostedRolesStatus.value === 'resolved',
	);
	const rolesUnresolved = computed(
		() => status.value === 'hosted' && hostedRolesStatus.value === 'failed',
	);
	/**
	 * Signed-in Power Apps host, even while Acting as a demo persona.
	 */
	const hostActor = computed(() => {
		if (hostedIdentitySnapshot.value) {
			return hostedIdentitySnapshot.value;
		}
		if (status.value === 'hosted') {
			return identity.value;
		}
		return null;
	});

	/**
	 * Loads host context once; subsequent callers await the same promise.
	 * Failed loads clear the in-flight promise so {@link retryLoad} can run.
	 * Always prefer an in-flight `loadPromise` over status short-circuit so callers
	 * never observe hosted identity before role refresh finishes.
	 */
	async function ensureLoaded(): Promise<void> {
		if (loadPromise) {
			await loadPromise;
			return;
		}
		if (status.value === 'hosted' || status.value === 'standalone') {
			return;
		}
		loadPromise = loadContext().finally(() => {
			if (status.value === 'failed') {
				loadPromise = null;
			}
		});
		await loadPromise;
	}

	/**
	 * Retries host context after a failed load.
	 */
	async function retryLoad(): Promise<void> {
		loadPromise = null;
		status.value = 'loading';
		error.value = null;
		hostedIdentitySnapshot.value = null;
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
		hostedRolesStatus.value = 'resolved';
	}

	/**
	 * DEV Local Play: apply roles from the local persona directory
	 * (`VITE_LOCAL_DEMO_*` / `LOCAL_DEMO_PERSONAS`) when the host UPN matches.
	 * Authoritative in DEV so Local Play is not stuck on user-only when
	 * GET /principal returns least-privilege or is unreachable.
	 */
	function applyDevPersonaRolesIfKnown(actorEmail: string): boolean {
		if (!allowsDemoIdentityFallback()) {
			return false;
		}
		if (!isKnownLocalDemoEmail(actorEmail)) {
			return false;
		}
		identity.value = {
			...identity.value,
			roles: resolvePrincipalRolesByEmail(actorEmail),
		};
		hostedRolesStatus.value = 'resolved';
		error.value = null;
		return true;
	}

	/**
	 * Loads roles from GET /principal after host context (server-derived, not client headers).
	 * In DEV, known local-persona emails use `VITE_LOCAL_DEMO_*` roles first.
	 */
	async function refreshHostedRoles(): Promise<void> {
		const actorEmail = identity.value.email;
		if (status.value !== 'hosted' || !actorEmail) {
			return;
		}
		hostedRolesStatus.value = 'loading';
		// Local Play often reports status=hosted with a real UPN. Prefer the
		// matching demo persona (env override) over a user-only principal payload.
		if (applyDevPersonaRolesIfKnown(actorEmail)) {
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
				hostedRolesStatus.value = 'resolved';
				return;
			}
			identity.value = {
				...identity.value,
				roles: resolveHostedRoles(null),
			};
			hostedRolesStatus.value = 'resolved';
		}
		catch {
			if (applyDevPersonaRolesIfKnown(actorEmail)) {
				return;
			}
			hostedRolesStatus.value = 'failed';
			error.value = 'Could not load security roles from the API';
		}
	}

	async function loadContext(): Promise<void> {
		status.value = 'loading';
		error.value = null;
		hostedRolesStatus.value = 'idle';
		hostedIdentitySnapshot.value = null;

		try {
			const result = await raceHostContext();

			if (result.kind === 'timeout') {
				// Hosted/prod builds must not install demo identity on a slow host.
				// In DEV, a hanging getContext (no Power Apps host / missing pac init)
				// is treated like a missing plugin so local play still works.
				if (!allowsDemoIdentityFallback()) {
					status.value = 'failed';
					error.value = 'Power Apps host context timed out';
					identity.value = { roles: [] };
					return;
				}
				applyStandaloneDemo(LOCAL_DEMO_PERSONAS[0]);
				return;
			}

			if (result.kind === 'error') {
				throw result.error instanceof Error
					? result.error
					: new Error('Failed to load Power Apps context');
			}

			const hostContext = result.context;
			const hostEmail = hostActorEmail(hostContext.user);
			if (!hostEmail) {
				// Local Play / incomplete host sometimes returns context without UPN.
				// In DEV, honor VITE_LOCAL_DEMO_* via the primary local persona.
				if (allowsDemoIdentityFallback()) {
					applyStandaloneDemo(LOCAL_DEMO_PERSONAS[0]);
					return;
				}
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
		hostedIdentitySnapshot.value = null;
		identity.value = {
			userName: persona.userName,
			email: persona.email,
			roles: [...persona.roles],
		};
		status.value = 'standalone';
		hostedRolesStatus.value = 'resolved';
		error.value = null;
	}

	/**
	 * Remembers the hosted principal once so Acting as can restore it.
	 */
	function snapshotHostedIdentity(): void {
		if (hostedIdentitySnapshot.value || status.value !== 'hosted') {
			return;
		}
		hostedIdentitySnapshot.value = {
			userId: identity.value.userId,
			userName: identity.value.userName,
			email: identity.value.email,
			environmentId: identity.value.environmentId,
			roles: [...identity.value.roles],
		};
	}

	/**
	 * Overlays a demo persona on hosted DEV identity without dropping host status.
	 */
	function applyHostedDemoPersona(persona: (typeof LOCAL_DEMO_PERSONAS)[number]): void {
		snapshotHostedIdentity();
		identity.value = {
			...identity.value,
			userName: persona.userName,
			email: persona.email,
			roles: [...persona.roles],
		};
		hostedRolesStatus.value = 'resolved';
		error.value = null;
	}

	/**
	 * Restores the Power Apps host principal after a DEV Acting-as overlay.
	 */
	function restoreHostedIdentitySnapshot(): boolean {
		const snapshot = hostedIdentitySnapshot.value;
		if (!snapshot) {
			return false;
		}
		identity.value = {
			...snapshot,
			roles: [...snapshot.roles],
		};
		hostedRolesStatus.value = 'resolved';
		error.value = null;
		return true;
	}

	function hostedActorEmail(): string | undefined {
		const snapshotEmail = hostedIdentitySnapshot.value?.email?.trim().toLowerCase();
		if (snapshotEmail) {
			return snapshotEmail;
		}
		if (status.value === 'hosted') {
			return identity.value.email?.trim().toLowerCase();
		}
		return undefined;
	}

	/**
	 * DEV only: switch the mock principal without spoofing per-request bodies.
	 * Hosted Local Play keeps `hosted` status and overlays the demo email/roles.
	 */
	function switchLocalPersona(emailAddress: string): void {
		if (!allowsDemoIdentityFallback()) {
			return;
		}
		const normalized = emailAddress.trim().toLowerCase();
		if (!normalized) {
			return;
		}

		const hostEmail = hostedActorEmail();
		if (hostEmail && hostEmail === normalized) {
			if (hostedIdentitySnapshot.value) {
				restoreHostedIdentitySnapshot();
			}
			return;
		}

		const persona = LOCAL_DEMO_PERSONAS.find(
			(item) => item.email.toLowerCase() === normalized,
		);
		if (!persona) {
			return;
		}
		if (status.value === 'hosted' || hostedIdentitySnapshot.value) {
			applyHostedDemoPersona(persona);
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
		hostedRolesStatus,
		isLoading,
		isReady,
		isHosted,
		email,
		userName,
		canAct,
		rolesResolved,
		rolesUnresolved,
		hostActor,
		ensureLoaded,
		retryLoad,
		switchLocalPersona,
		applyHostedSecurityRoles,
		refreshHostedRoles,
		hasRole,
	};
});
