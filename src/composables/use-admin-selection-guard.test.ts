import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useAdminSelectionGuard } from '@/composables/use-admin-selection-guard';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';

interface Item {
	id: string;
	label: string;
}

async function flushWatchers(): Promise<void> {
	await Promise.resolve();
	await nextTick();
}

describe('useAdminSelectionGuard', () => {
	it('selects and hydrates the first item by default', () => {
		const hydrated: string[] = [];
		const items = ref<Item[]>([{ id: 'first', label: 'First' }]);

		const guard = useAdminSelectionGuard({
			items,
			getId: (item) => item.id,
			hydrate: (item) => hydrated.push(item.id),
			isDirty: ref(false),
			confirmTitle: 'Discard changes?',
			confirmMessage: 'Switching will discard edits.',
		});

		expect(guard.selectedId.value).toBe('first');
		expect(hydrated).toEqual(['first']);
	});

	it('reverts selection when dirty changes are not discarded', async() => {
		const hydrated: string[] = [];
		const items = ref<Item[]>([
			{ id: 'first', label: 'First' },
			{ id: 'second', label: 'Second' },
		]);
		const dirty = ref(true);
		const guard = useAdminSelectionGuard({
			items,
			getId: (item) => item.id,
			hydrate: (item) => hydrated.push(item.id),
			isDirty: dirty,
			confirmTitle: 'Discard changes?',
			confirmMessage: 'Switching will discard edits.',
		});
		const dialog = useConfirmDialog();

		guard.selectedId.value = 'second';
		await nextTick();
		expect(dialog.options.value?.title).toBe('Discard changes?');

		dialog.resolve(false);
		await flushWatchers();

		expect(guard.selectedId.value).toBe('first');
		expect(guard.revertToId.value).toBe(null);
		expect(hydrated).toEqual(['first']);
	});

	it('hydrates the next item when dirty changes are discarded', async() => {
		const hydrated: string[] = [];
		const items = ref<Item[]>([
			{ id: 'first', label: 'First' },
			{ id: 'second', label: 'Second' },
		]);
		const dirty = ref(true);
		const guard = useAdminSelectionGuard({
			items,
			getId: (item) => item.id,
			hydrate: (item) => hydrated.push(item.id),
			isDirty: dirty,
			confirmTitle: 'Discard changes?',
			confirmMessage: 'Switching will discard edits.',
		});
		const dialog = useConfirmDialog();

		guard.selectedId.value = 'second';
		await nextTick();
		dialog.resolve(true);
		await flushWatchers();

		expect(guard.selectedId.value).toBe('second');
		expect(hydrated).toEqual(['first', 'second']);
	});

	it('does not re-hydrate the same selection while dirty when items refetch', async() => {
		const hydrated: string[] = [];
		const items = ref<Item[]>([
			{ id: 'first', label: 'First' },
			{ id: 'second', label: 'Second' },
		]);
		const dirty = ref(false);
		useAdminSelectionGuard({
			items,
			getId: (item) => item.id,
			hydrate: (item) => hydrated.push(`${item.id}:${item.label}`),
			isDirty: dirty,
			confirmTitle: 'Discard changes?',
			confirmMessage: 'Switching will discard edits.',
		});

		expect(hydrated).toEqual(['first:First']);
		dirty.value = true;
		items.value = [
			{ id: 'first', label: 'First updated' },
			{ id: 'second', label: 'Second' },
		];
		await flushWatchers();
		expect(hydrated).toEqual(['first:First']);
	});
});
