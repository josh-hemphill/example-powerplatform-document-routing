<script setup lang="ts">
import type { Document, PriorityLevel, TypeRequestField } from '@/client/types.gen';
import { typeFieldDisplayLabel } from '@/domain/type-request-fields';
import { computed } from 'vue';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import PriorityChip from '@/components/PriorityChip.vue';
import WorkflowTimeline from '@/components/WorkflowTimeline.vue';

const props = defineProps<{
	document: Document;
	typeLabel: string;
	priorityCatalog: PriorityLevel[];
	requestFields?: TypeRequestField[];
}>();

const typeFieldChips = computed(() =>
	(props.requestFields ?? [])
		.map((field) => {
			const value = props.document.typeFieldValues?.[field.key];
			const label = typeFieldDisplayLabel(field, value);
			if (!label) {
				return null;
			}
			return { key: field.key, heading: field.label, label };
		})
		.filter((item): item is { key: string; heading: string; label: string } => item !== null),
);

const emit = defineEmits<{
	refresh: [];
	openFeedback: [];
}>();

const openCount = computed(() => {
	if (typeof props.document.openAuthoritativeCommentCount === 'number') {
		return props.document.openAuthoritativeCommentCount;
	}
	return props.document.reviewComments.filter(
		(comment) =>
			comment.kind === 'decision'
			&& comment.authorityLevel === 'authoritative'
			&& comment.status === 'open',
	).length;
});
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-2">
			<div>
				<h1 class="text-h6 font-weight-bold">
					{{ document.title }}
				</h1>
				<div class="text-body-2 text-medium-emphasis">
					<template v-if="document.documentNumber">
						{{ document.documentNumber }}
						<template v-if="document.documentVersion">
							· v{{ document.documentVersion }}
						</template>
						·
					</template>
					{{ typeLabel }} · Requested by {{ document.requesterEmail }}
					<template v-if="typeFieldChips.length">
						·
						<span
							v-for="field in typeFieldChips"
							:key="field.key"
						>
							{{ field.heading }}: {{ field.label }}
						</span>
					</template>
				</div>
			</div>
			<div class="d-flex align-center ga-2 flex-wrap">
				<PriorityChip
					:priority-key="document.priority"
					:catalog="priorityCatalog"
				/>
				<button
					v-if="openCount > 0"
					type="button"
					class="header-comment-link"
					@click="emit('openFeedback')"
				>
					<v-chip
						size="small"
						color="error"
						variant="tonal"
					>
						{{ openCount }} open
						{{ openCount === 1 ? 'comment' : 'comments' }}
					</v-chip>
				</button>
				<DocumentStatusChip :status="document.status" />
				<v-btn size="small" variant="tonal" @click="emit('refresh')">
					Refresh
				</v-btn>
			</div>
		</div>
		<WorkflowTimeline :status="document.status" />
	</v-card>
</template>

<style scoped>
.header-comment-link {
	background: none;
	border: 0;
	padding: 0;
	cursor: pointer;
}

.header-comment-link:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
	border-radius: 16px;
}
</style>
