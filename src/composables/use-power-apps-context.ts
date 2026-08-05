/**
 * Compatibility composable over the app-level identity store.
 * Prefer `useIdentityStore()` in new code.
 */
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';
import { useIdentityStore } from '@/stores/identity';

/**
 * Loads Power Apps host context without blocking first paint in local play.
 */
export function usePowerAppsContext() {
	const store = useIdentityStore();
	const { identity, isLoading, error, isHosted, canAct, status } = storeToRefs(store);

	onMounted(() => {
		void store.ensureLoaded();
	});

	return {
		context: identity,
		isLoading,
		error,
		isHosted,
		canAct,
		status,
		ensureLoaded: store.ensureLoaded,
		switchLocalPersona: store.switchLocalPersona,
	};
}
