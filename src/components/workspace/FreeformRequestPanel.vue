<script setup lang="ts">
defineProps<{
	freeformRequest: string;
	expanded: boolean;
}>();
const emit = defineEmits<{
	toggle: [];
}>();
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between ga-2 mb-2">
			<button
				type="button"
				class="stage-toggle text-subtitle-1 font-weight-bold"
				@click="emit('toggle')"
			>
				1. Freeform request
			</button>
			<v-btn
				variant="text"
				size="small"
				:icon="expanded ? '$chevronUp' : '$chevronDown'"
				:aria-label="expanded ? 'Collapse freeform request' : 'Expand freeform request'"
				@click="emit('toggle')"
			/>
		</div>
		<p
			v-if="expanded"
			class="markdown-preview mb-0"
		>
			{{ freeformRequest }}
		</p>
		<p
			v-else
			class="text-body-2 text-medium-emphasis mb-0 text-truncate"
		>
			{{ freeformRequest }}
		</p>
	</v-card>
</template>

<style scoped>
.stage-toggle {
	background: none;
	border: 0;
	padding: 0;
	cursor: pointer;
	text-align: start;
	color: inherit;
	font: inherit;
}
</style>
