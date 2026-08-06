<script setup lang="ts">
defineProps<{
	freeformRequest: string;
}>();
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="text-subtitle-1 font-weight-bold mb-2">
			1. Freeform request
		</div>
		<p class="markdown-preview mb-0">
			{{ freeformRequest }}
		</p>
	</v-card>
</template>
