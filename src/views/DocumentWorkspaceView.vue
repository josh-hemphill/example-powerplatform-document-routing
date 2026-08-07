<script setup lang="ts">
import type { WorkspaceStageId } from '@/domain/workspace-stages';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import ApprovalPanel from '@/components/workspace/ApprovalPanel.vue';
import DraftPanel from '@/components/workspace/DraftPanel.vue';
import FreeformRequestPanel from '@/components/workspace/FreeformRequestPanel.vue';
import HistoryPanel from '@/components/workspace/HistoryPanel.vue';
import PublishPanel from '@/components/workspace/PublishPanel.vue';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader.vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';
import { useDocumentWorkspace } from '@/composables/use-document-workspace';
import { primaryWorkspaceStage } from '@/domain/workspace-stages';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirmDialog();
const documentId = computed(() => String(route.params.documentId));

const {
	document,
	isPending,
	error,
	refetch,
	context,
	actionError,
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
	isSuperseding,
	isAbandoningSupersede,
	isPublishingPdf,
	hasDraftRevisionConflict,
	onSaveDraft,
	onReloadDraftAfterConflict,
	onSubmitForApproval,
	onClaim,
	onRelease,
	onProcessSla,
	onWithdrawAndRevise,
	onSupersede,
	onAbandonSupersede,
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
	canSupersede,
	canAbandonSupersede,
	publishedLibraryPath,
} = useDocumentWorkspace(documentId);

const typeLabel = computed(() => documentType.value.label);

/** Manual overrides; reset when document status changes. */
const stageOverrides = ref<Partial<Record<WorkspaceStageId, boolean>> | null>(null);

watch(
	() => document.value?.status,
	() => {
		stageOverrides.value = null;
	},
);

function isStageExpanded(stage: WorkspaceStageId): boolean {
	if (stageOverrides.value && stage in stageOverrides.value) {
		return Boolean(stageOverrides.value[stage]);
	}
	const primary = document.value ? primaryWorkspaceStage(document.value.status) : null;
	return primary === stage;
}

function toggleStage(stage: WorkspaceStageId): void {
	const currentlyOpen = isStageExpanded(stage);
	const primary = document.value ? primaryWorkspaceStage(document.value.status) : null;
	const next: Partial<Record<WorkspaceStageId, boolean>> = {
		...(stageOverrides.value ?? {}),
	};
	// Ensure primary stays as baseline when first toggling.
	if (!stageOverrides.value && primary) {
		for (const id of ['freeform', 'draft', 'approval', 'publish'] as const) {
			next[id] = id === primary;
		}
	}
	next[stage] = !currentlyOpen;
	stageOverrides.value = next;
}

async function handleReject(): Promise<void> {
	const ok = await confirm({
		title: 'Reject this document?',
		message: 'Rejection ends the current approval chain. Authors can withdraw and revise afterward.',
		confirmText: 'Reject',
		color: 'error',
	});
	if (!ok) {
		return;
	}
	await onDecision('reject');
}

async function handleWithdraw(): Promise<void> {
	const ok = await confirm({
		title: 'Withdraw and revise?',
		message: 'Approval steps will be cleared and the case returns to drafting.',
		confirmText: 'Withdraw & revise',
		color: 'warning',
	});
	if (!ok) {
		return;
	}
	await onWithdrawAndRevise();
}

async function handlePublish(): Promise<void> {
	const ok = await confirm({
		title: 'Publish PDF to SharePoint?',
		message: 'This publishes the approved revision to the allowlisted destination. Republishing the same revision is idempotent.',
		confirmText: 'Publish PDF',
		color: 'primary',
	});
	if (!ok) {
		return;
	}
	await onPublish();
}

async function handleSupersede(): Promise<void> {
	const ok = await confirm({
		title: 'Supersede with a new case?',
		message: 'Opens a drafting successor. The current published document stays current until the successor publishes.',
		confirmText: 'Supersede',
		color: 'primary',
	});
	if (!ok) {
		return;
	}
	const successorId = await onSupersede();
	if (successorId) {
		await router.push({ name: 'document', params: { documentId: successorId } });
	}
}

async function handleAbandonSupersede(): Promise<void> {
	const ok = await confirm({
		title: 'Abandon this supersede successor?',
		message: 'The successor case will be abandoned so a new supersede can be opened on the prior published document.',
		confirmText: 'Abandon successor',
		color: 'warning',
	});
	if (!ok) {
		return;
	}
	await onAbandonSupersede();
}
</script>

<template>
	<div>
		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
			role="alert"
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
			role="alert"
		>
			{{ actionError }}
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="article, actions" />

		<template v-else-if="document">
			<v-alert
				v-if="document.supersedesDocumentId"
				type="info"
				variant="tonal"
				class="mb-4"
			>
				This case supersedes a prior published document. The prior number stays current until you publish this revision.
				<RouterLink
					class="ms-1"
					:to="{ name: 'document', params: { documentId: document.supersedesDocumentId } }"
				>
					Open prior case
				</RouterLink>
			</v-alert>

			<v-alert
				v-if="document.status === 'published' || document.status === 'superseded'"
				type="info"
				variant="tonal"
				class="mb-4"
			>
				Published finals are immutable. Use supersede to open a new case — do not edit this content in place.
				<RouterLink
					v-if="publishedLibraryPath"
					class="ms-1"
					:to="publishedLibraryPath"
				>
					View published document
				</RouterLink>
			</v-alert>

			<WorkspaceHeader
				:document="document"
				:type-label="typeLabel"
				@refresh="() => refetch()"
			/>

			<div
				v-if="canSupersede || canAbandonSupersede"
				class="mb-4 d-flex flex-wrap ga-2"
			>
				<v-btn
					v-if="canSupersede"
					color="primary"
					:loading="isSuperseding"
					@click="handleSupersede"
				>
					Supersede with new case
				</v-btn>
				<v-btn
					v-if="canAbandonSupersede"
					variant="tonal"
					color="warning"
					:loading="isAbandoningSupersede"
					@click="handleAbandonSupersede"
				>
					Abandon supersede successor
				</v-btn>
			</div>

			<v-row>
				<v-col cols="12" md="7">
					<FreeformRequestPanel
						:freeform-request="document.freeformRequest"
						:expanded="isStageExpanded('freeform')"
						@toggle="toggleStage('freeform')"
					/>

					<DraftPanel
						v-model:title="draftForm.title"
						v-model:summary="draftForm.summary"
						v-model:body-markdown="draftForm.bodyMarkdown"
						:actor-email="context.email"
						:author-email="document.authorEmail"
						:can-draft="Boolean(canDraft)"
						:is-saving="isSavingDraft"
						:is-dirty="isDraftDirty"
						:has-revision-conflict="hasDraftRevisionConflict"
						:expanded="isStageExpanded('draft')"
						@save="onSaveDraft"
						@discard="() => hydrateFromDocument(true)"
						@reload="onReloadDraftAfterConflict"
						@toggle="toggleStage('draft')"
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
						:expanded="isStageExpanded('approval')"
						@submit="onSubmitForApproval"
						@claim="onClaim"
						@release="onRelease"
						@approve="() => onDecision('approve')"
						@reject="handleReject"
						@process-sla="onProcessSla"
						@withdraw="handleWithdraw"
						@toggle="toggleStage('approval')"
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
						:expanded="isStageExpanded('publish')"
						@publish="handlePublish"
						@toggle="toggleStage('publish')"
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
