<script setup lang="ts">
import MarkdownPreview from '@/components/MarkdownPreview.vue';

defineProps<{
	draftPreview: string;
}>();
</script>

<template>
	<v-card class="pa-4">
		<div class="text-subtitle-1 font-weight-bold mb-2">
			Draft preview
		</div>
		<MarkdownPreview
			:source="draftPreview"
			empty-text="No draft yet."
		/>
	</v-card>
</template>
