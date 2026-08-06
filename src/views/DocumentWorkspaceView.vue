<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import ApprovalPanel from '@/components/workspace/ApprovalPanel.vue';
import DraftPanel from '@/components/workspace/DraftPanel.vue';
import FreeformRequestPanel from '@/components/workspace/FreeformRequestPanel.vue';
import HistoryPanel from '@/components/workspace/HistoryPanel.vue';
import PublishPanel from '@/components/workspace/PublishPanel.vue';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader.vue';
import { useDocumentWorkspace } from '@/composables/use-document-workspace';

const route = useRoute();
const documentId = computed(() => String(route.params.documentId));

const {
	document,
	isPending,
	error,
	refetch,
	context,
	actionError,
	actionSuccess,
	documentType,
	approvalChainPreview,
	destinationItems,
	selectedDestination,
	previewFileName,
	draftForm,
	publishForm,
	approvalForm,
	decisionForm,
	isDraftDirty,
	hydrateFromDocument,
	isSavingDraft,
	isSubmittingApproval,
	isDecidingStep,
	isClaiming,
	isReleasing,
	isProcessingSla,
	isWithdrawing,
	isPublishingPdf,
	onSaveDraft,
	onSubmitForApproval,
	onClaim,
	onRelease,
	onProcessSla,
	onWithdrawAndRevise,
	onDecision,
	onPublish,
	canDraft,
	canSubmitApproval,
	canClaim,
	canRelease,
	canDecide,
	canPublish,
	canProcessSla,
	canWithdraw,
} = useDocumentWorkspace(documentId);

const typeLabel = computed(() => documentType.value.label);
</script>

<template>
	<div>
		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			<div class="d-flex flex-wrap align-center justify-space-between ga-3">
				<div>
					{{ getApiErrorMessage(error, 'Failed to load document') }}
				</div>
				<div class="d-flex flex-wrap ga-2">
					<v-btn size="small" variant="tonal" @click="() => refetch()">
						Retry
					</v-btn>
					<v-btn size="small" variant="text" :to="{ name: 'inbox' }">
						Back to inbox
					</v-btn>
				</div>
			</div>
		</v-alert>
		<v-alert
			v-if="actionError"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			{{ actionError }}
		</v-alert>
		<v-alert
			v-if="actionSuccess"
			type="success"
			variant="tonal"
			class="mb-4"
		>
			{{ actionSuccess }}
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="article, actions" />

		<template v-else-if="document">
			<WorkspaceHeader
				:document="document"
				:type-label="typeLabel"
				@refresh="() => refetch()"
			/>

			<v-row>
				<v-col cols="12" md="7">
					<FreeformRequestPanel :freeform-request="document.freeformRequest" />

					<DraftPanel
						v-model:title="draftForm.title"
						v-model:summary="draftForm.summary"
						v-model:body-markdown="draftForm.bodyMarkdown"
						:actor-email="context.email"
						:author-email="document.authorEmail"
						:can-draft="Boolean(canDraft)"
						:is-saving="isSavingDraft"
						:is-dirty="isDraftDirty"
						@save="onSaveDraft"
						@discard="() => hydrateFromDocument(true)"
					/>

					<ApprovalPanel
						v-model:approval-comment="approvalForm.comment"
						v-model:decision-comment="decisionForm.comment"
						:document="document"
						:type-label="typeLabel"
						:approval-chain-preview="approvalChainPreview"
						:actor-email="context.email"
						:can-submit-approval="Boolean(canSubmitApproval)"
						:can-claim="Boolean(canClaim)"
						:can-release="Boolean(canRelease)"
						:can-decide="Boolean(canDecide)"
						:can-process-sla="Boolean(canProcessSla)"
						:can-withdraw="Boolean(canWithdraw)"
						:is-submitting-approval="isSubmittingApproval"
						:is-claiming="isClaiming"
						:is-releasing="isReleasing"
						:is-deciding-step="isDecidingStep"
						:is-processing-sla="isProcessingSla"
						:is-withdrawing="isWithdrawing"
						@submit="onSubmitForApproval"
						@claim="onClaim"
						@release="onRelease"
						@approve="() => onDecision('approve')"
						@reject="() => onDecision('reject')"
						@process-sla="onProcessSla"
						@withdraw="onWithdrawAndRevise"
					/>

					<PublishPanel
						v-model:publish-destination-id="publishForm.publishDestinationId"
						v-model:folder-path-override="publishForm.folderPathOverride"
						:destination-items="destinationItems"
						:destination-root="selectedDestination?.folderPath"
						:preview-file-name="previewFileName"
						:published-pdf-url="document.publishedPdfUrl"
						:can-publish="Boolean(canPublish)"
						:is-publishing="isPublishingPdf"
						@publish="onPublish"
					/>
				</v-col>

				<v-col cols="12" md="5">
					<HistoryPanel
						:history="document.history"
						:draft-preview="draftForm.bodyMarkdown"
					/>
				</v-col>
			</v-row>
		</template>
	</div>
</template>
