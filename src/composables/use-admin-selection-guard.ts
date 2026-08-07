import type { ComputedRef, Ref } from 'vue';
import { ref, watch } from 'vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';

type ReadableRef<T> = Ref<T> | ComputedRef<T>;

function readDirty(isDirty: ReadableRef<boolean> | (() => boolean)): boolean {
	if (typeof isDirty === 'function') {
		return isDirty();
	}
	return isDirty.value;
}

export function useAdminSelectionGuard<T>(input: {
	items: ReadableRef<T[]>;
	getId: (item: T) => string;
	hydrate: (item: T) => void;
	isDirty: ReadableRef<boolean> | (() => boolean);
	confirmTitle: string;
	confirmMessage: string;
}) {
	const { confirm } = useConfirmDialog();
	const selectedId = ref<string | null>(null);
	const revertToId = ref<string | null>(null);

	watch(
		input.items,
		(items) => {
			if (!selectedId.value && items[0]) {
				selectedId.value = input.getId(items[0]);
			}
		},
		{ immediate: true },
	);

	watch(
		[selectedId, input.items],
		async([nextId], [previousId]) => {
			if (nextId && revertToId.value === nextId) {
				revertToId.value = null;
				return;
			}
			if (
				previousId
				&& nextId !== previousId
				&& readDirty(input.isDirty)
			) {
				const ok = await confirm({
					title: input.confirmTitle,
					message: input.confirmMessage,
					confirmText: 'Discard',
					color: 'warning',
				});
				if (!ok) {
					revertToId.value = previousId;
					selectedId.value = previousId;
					return;
				}
			}
			const entity = input.items.value.find((item) => input.getId(item) === nextId);
			if (!entity) {
				return;
			}
			input.hydrate(entity);
		},
		{ immediate: true },
	);

	return {
		selectedId,
		revertToId,
	};
}
