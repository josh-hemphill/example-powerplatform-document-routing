<script setup lang="ts">
import {
	bodyMarkdownRules,
	SUMMARY_MAX_LENGTH,
	summaryRules,
	TITLE_MAX_LENGTH,
	titleRules,
} from '@/api/form-rules';

defineProps<{
	actorEmail: string | null | undefined;
	authorEmail: string | null | undefined;
	canDraft: boolean;
	isSaving: boolean;
	isDirty: boolean;
}>();
const emit = defineEmits<{
	save: [];
	discard: [];
}>();
const title = defineModel<string>('title', { required: true });
const summary = defineModel<string>('summary', { required: true });
const bodyMarkdown = defineModel<string>('bodyMarkdown', { required: true });
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<div class="text-subtitle-1 font-weight-bold">
				2. Author / draft
			</div>
			<v-chip
				v-if="isDirty"
				size="small"
				color="warning"
				variant="tonal"
			>
				Unsaved changes
			</v-chip>
		</div>
		<p class="text-body-2 text-medium-emphasis mb-2">
			Signed in as {{ actorEmail }}. Collaborative authors on this type can co-edit before submit.
		</p>
		<v-text-field
			v-model="title"
			label="Document title"
			:rules="titleRules()"
			:disabled="!canDraft"
			class="mb-2"
			:counter="TITLE_MAX_LENGTH"
			:maxlength="TITLE_MAX_LENGTH"
		/>
		<v-text-field
			:model-value="authorEmail ?? '—'"
			label="Author (from principal on first save)"
			readonly
			disabled
			class="mb-2"
		/>
		<v-text-field
			v-model="summary"
			label="Short summary"
			:rules="summaryRules()"
			:disabled="!canDraft"
			class="mb-2"
			:counter="SUMMARY_MAX_LENGTH"
			:maxlength="SUMMARY_MAX_LENGTH"
		/>
		<v-textarea
			v-model="bodyMarkdown"
			label="Draft (Markdown)"
			rows="12"
			:rules="bodyMarkdownRules()"
			:disabled="!canDraft"
			class="mb-3"
		/>
		<div class="d-flex flex-wrap ga-2">
			<v-btn
				color="secondary"
				:disabled="!canDraft"
				:loading="isSaving"
				@click="emit('save')"
			>
				Save draft
			</v-btn>
			<v-btn
				v-if="isDirty"
				variant="text"
				:disabled="!canDraft || isSaving"
				@click="emit('discard')"
			>
				Discard changes
			</v-btn>
		</div>
	</v-card>
</template>
