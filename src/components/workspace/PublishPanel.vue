<script setup lang="ts">
import { destinationRequiredRule } from '@/api/form-rules';

defineProps<{
	destinationItems: Array<{ title: string; value: string; subtitle?: string }>;
	destinationRoot: string | null | undefined;
	previewFileName: string;
	publishedPdfUrl: string | null | undefined;
	canPublish: boolean;
	isPublishing: boolean;
}>();
const emit = defineEmits<{
	publish: [];
}>();
const publishDestinationId = defineModel<string | null>('publishDestinationId', { required: true });
const folderPathOverride = defineModel<string>('folderPathOverride', { required: true });
</script>

<template>
	<v-card class="pa-4">
		<div class="text-subtitle-1 font-weight-bold mb-3">
			4. Publish PDF to SharePoint
		</div>
		<p class="text-body-2 text-medium-emphasis mb-3">
			Publish runs server-side / via Flow against an allowlisted destination.
			The browser never uploads PDF bytes.
		</p>
		<v-select
			v-model="publishDestinationId"
			:items="destinationItems"
			item-title="title"
			item-value="value"
			label="Publish destination"
			:rules="[destinationRequiredRule()]"
			class="mb-2"
		/>
		<v-text-field
			v-model="folderPathOverride"
			label="Folder override (optional, under destination root)"
			:hint="destinationRoot ? `Root: ${destinationRoot}` : undefined"
			persistent-hint
			class="mb-2"
		/>
		<v-text-field
			:model-value="previewFileName"
			label="PDF file name (id + revision)"
			readonly
			disabled
			class="mb-3"
		/>
		<v-btn
			color="primary"
			:disabled="!canPublish"
			:loading="isPublishing"
			@click="emit('publish')"
		>
			Publish PDF
		</v-btn>
		<div v-if="publishedPdfUrl" class="mt-3">
			<a :href="publishedPdfUrl" target="_blank" rel="noreferrer">
				{{ publishedPdfUrl }}
			</a>
		</div>
	</v-card>
</template>
