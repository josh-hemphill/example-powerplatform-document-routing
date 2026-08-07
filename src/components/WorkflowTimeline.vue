<script setup lang="ts">
import type { DocumentStatus } from '@/domain/document-status';
import { computed } from 'vue';
import {
	DOCUMENT_STATUS_LABELS,
	getWorkflowStageIndex,
	WORKFLOW_STAGES,
} from '@/domain/document-status';

const props = defineProps<{
	status: DocumentStatus;
}>();

const activeIndex = computed(() => getWorkflowStageIndex(props.status));
const statusLabel = computed(() => DOCUMENT_STATUS_LABELS[props.status]);
</script>

<template>
	<div
		role="group"
		:aria-label="`Workflow progress: ${statusLabel}`"
	>
		<v-stepper
			:model-value="activeIndex + 1"
			alt-labels
			flat
			class="bg-transparent"
			non-linear
			readonly
			aria-hidden="true"
		>
			<v-stepper-header>
				<template v-for="(stage, index) in WORKFLOW_STAGES" :key="stage">
					<v-stepper-item
						:value="index + 1"
						:title="DOCUMENT_STATUS_LABELS[stage]"
						:complete="index < activeIndex || status === 'published'"
						:color="status === 'rejected' && stage === 'in_review' ? 'error' : undefined"
					/>
					<v-divider v-if="index < WORKFLOW_STAGES.length - 1" />
				</template>
			</v-stepper-header>
		</v-stepper>
		<p class="visually-hidden">
			Current status: {{ statusLabel }}
		</p>
	</div>
</template>

<style scoped>
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
