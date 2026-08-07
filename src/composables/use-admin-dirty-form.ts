import { computed, ref } from 'vue';

export function useAdminDirtyForm(snapshot: () => string) {
	const baseline = ref('');

	function isDirtySnapshot(value = snapshot()): boolean {
		return baseline.value !== '' && value !== baseline.value;
	}

	const dirty = computed(() => isDirtySnapshot());

	function captureBaseline(): string {
		const next = snapshot();
		baseline.value = next;
		return next;
	}

	function markClean(): void {
		captureBaseline();
	}

	return {
		baseline,
		dirty,
		markClean,
		captureBaseline,
		isDirtySnapshot,
	};
}
