import type { Ref } from 'vue';
import { computed } from 'vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { useWorkspaceCapabilities } from '@/composables/workspace/use-workspace-capabilities';
import { useWorkspaceCommands } from '@/composables/workspace/use-workspace-commands';
import { useWorkspaceDocumentState } from '@/composables/workspace/use-workspace-document-state';
import { useIdentityStore } from '@/stores/identity';

/**
 * Document workspace queries, form state, capabilities, and command handlers.
 */
export function useDocumentWorkspace(documentId: Ref<string>) {
	const { context, canAct } = usePowerAppsContext();
	const identity = useIdentityStore();
	const state = useWorkspaceDocumentState(documentId);
	const commands = useWorkspaceCommands({
		documentId,
		canAct,
		state,
	});
	const capabilities = useWorkspaceCapabilities({
		document: state.document,
		canAct,
		actorEmail: computed(() => context.value.email),
		isAdmin: () => identity.hasRole('admin'),
		hasPublisherRole: () => identity.hasRole('publisher'),
		activeStep: state.activeStep,
		publishDestinationId: computed(() => state.forms.publishForm.publishDestinationId),
	});

	return {
		document: state.document,
		isPending: state.isPending,
		error: state.error,
		refetch: state.refetch,
		context,
		actionError: commands.actionError,
		documentType: state.documentType,
		approvalChainPreview: state.approvalChainPreview,
		destinationItems: state.destinationItems,
		selectedDestination: state.selectedDestination,
		previewFileName: state.previewFileName,
		...state.forms,
		isSavingDraft: commands.isSavingDraft,
		isSubmittingApproval: commands.isSubmittingApproval,
		isDecidingStep: commands.isDecidingStep,
		isClaiming: commands.isClaiming,
		isReleasing: commands.isReleasing,
		isProcessingSla: commands.isProcessingSla,
		isWithdrawing: commands.isWithdrawing,
		isRespondingToReview: commands.isRespondingToReview,
		isAcknowledgingReview: commands.isAcknowledgingReview,
		isSuperseding: commands.isSuperseding,
		isAbandoningSupersede: commands.isAbandoningSupersede,
		isPublishingPdf: commands.isPublishingPdf,
		hasDraftRevisionConflict: commands.hasDraftRevisionConflict,
		onSaveDraft: commands.onSaveDraft,
		onReloadDraftAfterConflict: commands.onReloadDraftAfterConflict,
		onSubmitForApproval: commands.onSubmitForApproval,
		onClaim: commands.onClaim,
		onRelease: commands.onRelease,
		onProcessSla: commands.onProcessSla,
		onWithdrawAndRevise: commands.onWithdrawAndRevise,
		onRespondToReview: commands.onRespondToReview,
		onAcknowledgeReview: commands.onAcknowledgeReview,
		onSupersede: commands.onSupersede,
		onAbandonSupersede: commands.onAbandonSupersede,
		onDecision: commands.onDecision,
		onPublish: commands.onPublish,
		...capabilities,
		publishedLibraryPath: state.publishedLibraryPath,
	};
}
