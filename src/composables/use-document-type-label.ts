/**
 * Resolves a document type label from control API items with bundled seed fallback.
 */
import type { MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';
import {
	findDocumentSubtype,
	findDocumentType,
	formatTypeSubtypeLabel,
} from '@/config/document-types';

export interface TypeLabelSource {
	id: string;
	label: string;
	subtypes?: Array<{
		id?: string;
		key: string;
		label: string;
	}>;
}

/**
 * Builds a type-label lookup that prefers live control types over bundled seed config.
 */
export function useDocumentTypeLabel(
	types: MaybeRefOrGetter<TypeLabelSource[] | null | undefined>,
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

	function subtypeLabel(
		typeId: string,
		subtypeId: string | null | undefined,
	): string | null {
		if (!subtypeId) {
			return null;
		}
		const type = (toValue(types) ?? []).find((item) => item.id === typeId);
		const fromApi = type?.subtypes?.find(
			(item) => item.key === subtypeId || item.id === subtypeId,
		);
		if (fromApi) {
			return fromApi.label;
		}
		return findDocumentSubtype(typeId, subtypeId)?.label ?? null;
	}

	function typeAndSubtypeLabel(
		typeId: string,
		subtypeId?: string | null,
	): string {
		return formatTypeSubtypeLabel(typeLabel(typeId), subtypeLabel(typeId, subtypeId));
	}

	return { typeLabel, subtypeLabel, typeAndSubtypeLabel };
}
