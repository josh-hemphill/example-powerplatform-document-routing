<script setup lang="ts">
import { destinationRequiredRule } from '@/api/form-rules';

defineProps<{
	destinationItems: Array<{ title: string; value: string; subtitle?: string }>;
	destinationRoot: string | null | undefined;
	previewFileName: string;
	publishedPdfUrl: string | null | undefined;
	canPublish: boolean;
	isPublishing: boolean;
	expanded: boolean;
}>();
const emit = defineEmits<{
	publish: [];
	toggle: [];
}>();
const publishDestinationId = defineModel<string | null>('publishDestinationId', { required: true });
const folderPathOverride = defineModel<string>('folderPathOverride', { required: true });
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between ga-2 mb-3">
			<button
				type="button"
				class="stage-toggle text-subtitle-1 font-weight-bold"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			>
				4. Publish PDF to SharePoint
			</button>
			<v-btn
				variant="text"
				size="small"
				:icon="expanded ? '$chevronUp' : '$chevronDown'"
				:aria-label="expanded ? 'Collapse publish' : 'Expand publish'"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			/>
		</div>
		<p
			v-if="!expanded"
			class="text-body-2 text-medium-emphasis mb-0"
		>
			{{ publishedPdfUrl ? 'Published' : canPublish ? 'Ready to publish' : 'Waiting for approval' }}
		</p>
		<v-expand-transition>
			<div v-if="expanded">
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
				<div class="d-flex justify-end">
					<v-btn
						color="primary"
						:disabled="!canPublish"
						:loading="isPublishing"
						@click="emit('publish')"
					>
						Publish PDF
					</v-btn>
				</div>
				<div v-if="publishedPdfUrl" class="mt-3">
					<a :href="publishedPdfUrl" target="_blank" rel="noreferrer">
						{{ publishedPdfUrl }}
					</a>
				</div>
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
