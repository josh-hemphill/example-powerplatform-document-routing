/**
 * Resolves a document type label from control API items with bundled seed fallback.
 */
import type { MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';
import { findDocumentType } from '@/config/document-types';

/**
 * Builds a type-label lookup that prefers live control types over bundled seed config.
 */
export function useDocumentTypeLabel(
	types: MaybeRefOrGetter<Array<{ id: string; label: string }> | null | undefined>,
) {
	const labelById = computed(() => {
		const map = new Map<string, string>();
		for (const item of toValue(types) ?? []) {
			map.set(item.id, item.label);
		}
		return map;
	});

	function typeLabel(id: string): string {
		return labelById.value.get(id)
			?? findDocumentType(id)?.label
			?? id;
	}

	return { typeLabel };
}
