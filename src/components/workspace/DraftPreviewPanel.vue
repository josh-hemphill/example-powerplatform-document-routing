<script setup lang="ts">
defineProps<{
	draftPreview: string;
}>();
</script>

<template>
	<v-card class="pa-4">
		<div class="text-subtitle-1 font-weight-bold mb-2">
			Draft preview
		</div>
		<pre class="markdown-preview text-body-2 mb-0">{{ draftPreview || 'No draft yet.' }}</pre>
	</v-card>
</template>
