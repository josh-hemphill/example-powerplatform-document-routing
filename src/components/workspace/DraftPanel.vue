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
	hasRevisionConflict: boolean;
	expanded: boolean;
}>();
const emit = defineEmits<{
	save: [];
	discard: [];
	reload: [];
	toggle: [];
}>();
const title = defineModel<string>('title', { required: true });
const summary = defineModel<string>('summary', { required: true });
const bodyMarkdown = defineModel<string>('bodyMarkdown', { required: true });

const draftTitleRules = titleRules();
const draftSummaryRules = summaryRules();
const draftBodyRules = bodyMarkdownRules();
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<button
				type="button"
				class="stage-toggle text-subtitle-1 font-weight-bold"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			>
				2. Author / draft
			</button>
			<div class="d-flex align-center ga-2">
				<v-chip
					v-if="isDirty"
					size="small"
					color="warning"
					variant="tonal"
				>
					Unsaved changes
				</v-chip>
				<v-btn
					variant="text"
					size="small"
					:icon="expanded ? '$chevronUp' : '$chevronDown'"
					:aria-label="expanded ? 'Collapse draft' : 'Expand draft'"
					:aria-expanded="expanded"
					@click="emit('toggle')"
				/>
			</div>
		</div>
		<p
			v-if="!expanded"
			class="text-body-2 text-medium-emphasis mb-0 text-truncate"
		>
			{{ title || 'Untitled draft' }}
		</p>
		<template v-else>
			<v-alert
				v-if="hasRevisionConflict"
				type="warning"
				variant="tonal"
				class="mb-3"
				density="comfortable"
			>
				<div class="d-flex flex-wrap align-center justify-space-between ga-2">
					<span>
						Someone else saved a newer draft revision. Reload the server version before saving again.
					</span>
					<v-btn
						size="small"
						variant="tonal"
						@click="emit('reload')"
					>
						Reload draft
					</v-btn>
				</div>
			</v-alert>
			<p class="text-body-2 text-medium-emphasis mb-2">
				Signed in as {{ actorEmail }}. Collaborative authors on this type can co-edit before submit.
			</p>
			<v-text-field
				v-model="title"
				label="Document title"
				:rules="draftTitleRules"
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
				:rules="draftSummaryRules"
				:disabled="!canDraft"
				class="mb-2"
				:counter="SUMMARY_MAX_LENGTH"
				:maxlength="SUMMARY_MAX_LENGTH"
			/>
			<v-textarea
				v-model="bodyMarkdown"
				label="Draft (Markdown)"
				rows="12"
				:rules="draftBodyRules"
				:disabled="!canDraft"
				class="mb-3"
			/>
			<div class="d-flex flex-wrap justify-end ga-2">
				<v-btn
					v-if="isDirty"
					variant="text"
					:disabled="!canDraft || isSaving"
					@click="emit('discard')"
				>
					Discard changes
				</v-btn>
				<v-btn
					color="secondary"
					:disabled="!canDraft || hasRevisionConflict || isSaving"
					:loading="isSaving"
					@click="emit('save')"
				>
					Save draft
				</v-btn>
			</div>
		</template>
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
