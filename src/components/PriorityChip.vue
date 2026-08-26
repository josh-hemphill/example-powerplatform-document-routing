<script setup lang="ts">
import type { PriorityLevel } from '@/client/types.gen';
import { computed } from 'vue';

const props = defineProps<{
	priorityKey?: string | null;
	catalog: Array<Pick<PriorityLevel, 'key' | 'label' | 'color'>>;
}>();

const row = computed(() =>
	props.catalog.find((item) => item.key === props.priorityKey) ?? null,
);

const chipColor = computed(() => {
	if (!row.value || row.value.color === 'default') {
		return undefined;
	}
	return row.value.color;
});
</script>

<template>
	<v-chip
		v-if="row"
		size="x-small"
		:color="chipColor"
		:variant="row.color === 'error' ? 'flat' : 'tonal'"
	>
		{{ row.label }}
	</v-chip>
</template>
