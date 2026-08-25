<script setup lang="ts">
import MarkdownPreview from '@/components/MarkdownPreview.vue';

defineProps<{
	freeformRequest: string;
	expanded: boolean;
	isPrimary?: boolean;
	collapsedHint?: string | null;
}>();
const emit = defineEmits<{
	toggle: [];
}>();
</script>

<template>
	<v-card
		class="pa-4 mb-4 stage-card"
		:class="{ 'stage-card--primary': isPrimary && !expanded }"
	>
		<div class="d-flex align-center justify-space-between ga-2 mb-2">
			<button
				type="button"
				class="stage-toggle text-subtitle-1 font-weight-bold"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			>
				1. Freeform request
			</button>
			<div class="d-flex align-center ga-2">
				<v-chip
					v-if="!expanded && isPrimary"
					size="small"
					color="primary"
					variant="tonal"
				>
					Open to continue
				</v-chip>
				<v-btn
					variant="text"
					size="small"
					:icon="expanded ? '$chevronUp' : '$chevronDown'"
					:aria-label="expanded ? 'Collapse freeform request' : 'Expand freeform request'"
					:aria-expanded="expanded"
					@click="emit('toggle')"
				/>
			</div>
		</div>
		<p
			v-if="!expanded"
			class="text-body-2 text-medium-emphasis mb-0 text-truncate"
		>
			{{ collapsedHint || freeformRequest }}
		</p>
		<v-expand-transition>
			<div v-if="expanded">
				<MarkdownPreview :source="freeformRequest" />
			</div>
		</v-expand-transition>
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

.stage-toggle:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}
</style>
