<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdownToHtml } from '@/utils/render-markdown';

const props = defineProps<{
	source: string | null | undefined;
	emptyText?: string;
}>();

const html = computed(() => renderMarkdownToHtml(props.source));
const emptyText = computed(() => props.emptyText ?? 'No content yet.');
</script>

<template>
	<div
		v-if="html"
		class="markdown-preview text-body-2"
		v-html="html"
	/>
	<p
		v-else
		class="text-body-2 text-medium-emphasis mb-0"
	>
		{{ emptyText }}
	</p>
</template>
