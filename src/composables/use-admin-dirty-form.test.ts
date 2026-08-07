import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { useAdminDirtyForm } from '@/composables/use-admin-dirty-form';

describe('useAdminDirtyForm', () => {
	it('stays clean until a baseline is captured', () => {
		const form = reactive({ label: 'Original' });
		const state = useAdminDirtyForm(() => JSON.stringify(form));

		form.label = 'Edited';

		expect(state.baseline.value).toBe('');
		expect(state.dirty.value).toBe(false);
	});

	it('tracks changes against the captured baseline', () => {
		const form = reactive({ label: 'Original' });
		const state = useAdminDirtyForm(() => JSON.stringify(form));

		state.captureBaseline();
		expect(state.dirty.value).toBe(false);

		form.label = 'Edited';
		expect(state.dirty.value).toBe(true);
		expect(state.isDirtySnapshot(JSON.stringify({ label: 'Original' }))).toBe(false);

		state.markClean();
		expect(state.dirty.value).toBe(false);
		expect(state.baseline.value).toBe(JSON.stringify({ label: 'Edited' }));
	});
});
