/**
 * App-level Power Apps / standalone identity.
 * Single in-flight host context load; never trust request-body actor emails.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { appConfig } from '@/config/app.config';

export type IdentityStatus = 'loading' | 'hosted' | 'standalone' | 'failed';

export type DocumentRoutingRole
	= | 'user'
		| 'author'
		| 'approver'
		| 'publisher'
		| 'admin';

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
 * Resolves whether the current build may use the local demo identity fallback.
 */
export function allowsDemoIdentityFallback(): boolean {
	return Boolean(import.meta.env.DEV);
}

/**
 * Local-only personas for collaborative draft / approval demos (sets principal header).
 */
export const LOCAL_DEMO_PERSONAS: Array<{ label: string; email: string; userName: string }> = [
	{
		label: 'Local developer',
		email: appConfig.localDemoUser.email,
		userName: appConfig.localDemoUser.userName,
	},
	{
		label: 'Jordan Legal (pool)',
		email: 'jordan.legal@contoso.com',
		userName: 'Jordan Legal',
	},
	{
		label: 'Alex Requester',
		email: 'alex.requester@contoso.com',
		userName: 'Alex Requester',
	},
	{
		label: 'Casey Author',
		email: 'casey.author@contoso.com',
		userName: 'Casey Author',
	},
];

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
	 */
	async function ensureLoaded(): Promise<void> {
		if (status.value !== 'loading' && loadPromise === null) {
			return;
		}
		if (!loadPromise) {
			loadPromise = loadContext();
		}
		await loadPromise;
	}

	async function loadContext(): Promise<void> {
		status.value = 'loading';
		error.value = null;

		try {
			const { getContext } = await import('@microsoft/power-apps/app');
			const hostContext = await Promise.race([
				getContext(),
				new Promise<null>((resolve) => {
					window.setTimeout(resolve, HOST_CONTEXT_TIMEOUT_MS, null);
				}),
			]);

			if (!hostContext) {
				if (!allowsDemoIdentityFallback()) {
					status.value = 'failed';
					error.value = 'Power Apps host context unavailable';
					identity.value = { roles: [] };
					return;
				}
				applyStandaloneDemo(LOCAL_DEMO_PERSONAS[0]);
				return;
			}

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
				roles: ['user', 'author', 'approver', 'publisher'],
			};
			status.value = 'hosted';
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
			roles: ['user', 'author', 'approver', 'publisher', 'admin'],
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
		switchLocalPersona,
		hasRole,
	};
});
