/**
 * Workspace mutation handlers (draft, approval, publish, supersede).
 */
import type { Ref } from 'vue';
import type { PublishRequest } from '@/client/types.gen';
import type { WorkspaceDocumentState } from '@/composables/workspace/use-workspace-document-state';
import { useMutation } from '@pinia/colada';
import { ref } from 'vue';
import { getApiErrorCode, getApiErrorMessage } from '@/api/api-error';
import {
	abandonSupersedeMutation,
	claimApprovalStepMutation,
	decideApprovalStepMutation,
	listLibraryDocumentsQueryKey,
	processApprovalSlaMutation,
	publishDocumentPdfMutation,
	releaseApprovalStepMutation,
	submitForApprovalMutation,
	supersedeDocumentMutation,
	updateDocumentDraftMutation,
	withdrawAndReviseMutation,
} from '@/client/@pinia/colada.gen';
import { useToast } from '@/composables/use-toast';
import { publishApprovedDocument } from '@/publishing/publish-document';

/**
 * Creates workspace command handlers against loaded document state.
 */
export function useWorkspaceCommands(options: {
	documentId: Ref<string>;
	canAct: Ref<boolean>;
	state: WorkspaceDocumentState;
}) {
	const { documentId, canAct, state } = options;
	const {
		document,
		forms,
		activeStep,
		refetch,
		invalidateDocumentQueries,
		queryCache,
	} = state;
	const toast = useToast();
	const actionError = ref<string | null>(null);
	const hasDraftRevisionConflict = ref(false);

	const { mutateAsync: saveDraftAsync, isLoading: isSavingDraft } = useMutation({
		...updateDocumentDraftMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: submitApprovalAsync, isLoading: isSubmittingApproval }
		= useMutation({
			...submitForApprovalMutation(),
			async onSettled() {
				await invalidateDocumentQueries();
			},
		});

	const { mutateAsync: decideStepAsync, isLoading: isDecidingStep } = useMutation({
		...decideApprovalStepMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: claimStepAsync, isLoading: isClaiming } = useMutation({
		...claimApprovalStepMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: releaseStepAsync, isLoading: isReleasing } = useMutation({
		...releaseApprovalStepMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: processSlaAsync, isLoading: isProcessingSla } = useMutation({
		...processApprovalSlaMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: withdrawAsync, isLoading: isWithdrawing } = useMutation({
		...withdrawAndReviseMutation(),
		async onSettled() {
			await invalidateDocumentQueries();
		},
	});

	const { mutateAsync: supersedeAsync, isLoading: isSuperseding } = useMutation({
		...supersedeDocumentMutation(),
		async onSettled() {
			await Promise.all([
				invalidateDocumentQueries(),
				queryCache.invalidateQueries({ key: listLibraryDocumentsQueryKey() }),
			]);
		},
	});

	const { mutateAsync: abandonSupersedeAsync, isLoading: isAbandoningSupersede } = useMutation({
		...abandonSupersedeMutation(),
		async onSettled() {
			await Promise.all([
				invalidateDocumentQueries(),
				queryCache.invalidateQueries({ key: listLibraryDocumentsQueryKey() }),
			]);
		},
	});

	const { mutateAsync: publishPdfAsync, isLoading: isPublishingPdf } = useMutation({
		...publishDocumentPdfMutation(),
		async onSettled() {
			await Promise.all([
				invalidateDocumentQueries(),
				queryCache.invalidateQueries({ key: listLibraryDocumentsQueryKey() }),
			]);
		},
	});

	function clearActionFeedback(): void {
		actionError.value = null;
		hasDraftRevisionConflict.value = false;
	}

	function showSuccess(message: string): void {
		toast.success(message);
	}

	async function onSaveDraft(): Promise<void> {
		clearActionFeedback();
		if (!canAct.value) {
			actionError.value = 'Sign-in identity is required.';
			return;
		}
		if (!document.value) {
			return;
		}
		try {
			await saveDraftAsync({
				path: { documentId: documentId.value },
				body: {
					title: forms.draftForm.title,
					bodyMarkdown: forms.draftForm.bodyMarkdown,
					summary: forms.draftForm.summary || undefined,
					expectedContentRevision: document.value.contentRevision,
				},
			});
			forms.markDraftClean();
			showSuccess('Draft saved. Ready for the approval chain when content is complete.');
		}
		catch(saveError) {
			if (getApiErrorCode(saveError) === 'revision_conflict') {
				hasDraftRevisionConflict.value = true;
				actionError.value = getApiErrorMessage(
					saveError,
					'Draft was updated by someone else; reload and retry',
				);
				return;
			}
			actionError.value = getApiErrorMessage(saveError, 'Failed to save draft');
		}
	}

	async function onReloadDraftAfterConflict(): Promise<void> {
		hasDraftRevisionConflict.value = false;
		actionError.value = null;
		await refetch();
		forms.hydrateFromDocument(true);
		showSuccess('Draft reloaded from the server.');
	}

	async function onSubmitForApproval(): Promise<void> {
		clearActionFeedback();
		try {
			await submitApprovalAsync({
				path: { documentId: documentId.value },
				body: {
					comment: forms.approvalForm.comment || undefined,
				},
			});
			showSuccess('Submitted to the approval chain.');
		}
		catch(submitError) {
			actionError.value = getApiErrorMessage(submitError, 'Failed to submit for approval');
		}
	}

	async function onClaim(): Promise<void> {
		clearActionFeedback();
		const step = activeStep.value;
		if (!step || step.status !== 'queued') {
			actionError.value = 'No queued pool step to claim.';
			return;
		}
		try {
			await claimStepAsync({
				path: { documentId: documentId.value, stepId: step.id },
				body: {},
			});
			showSuccess('Step claimed. You can approve or reject.');
		}
		catch(claimError) {
			actionError.value = getApiErrorMessage(claimError, 'Failed to claim step');
		}
	}

	async function onRelease(): Promise<void> {
		clearActionFeedback();
		const step = activeStep.value;
		if (!step || step.status !== 'pending' || step.assignmentMode !== 'pool') {
			actionError.value = 'No claimed pool step to release.';
			return;
		}
		try {
			await releaseStepAsync({
				path: { documentId: documentId.value, stepId: step.id },
				body: {},
			});
			showSuccess('Returned to the pool queue.');
		}
		catch(releaseError) {
			actionError.value = getApiErrorMessage(releaseError, 'Failed to release step');
		}
	}

	async function onProcessSla(): Promise<void> {
		clearActionFeedback();
		try {
			await processSlaAsync({
				path: { documentId: documentId.value },
				body: {},
			});
			showSuccess('SLA processor ran (elevates overdue steps when due).');
		}
		catch(slaError) {
			actionError.value = getApiErrorMessage(slaError, 'Failed to process SLA');
		}
	}

	async function onWithdrawAndRevise(): Promise<void> {
		clearActionFeedback();
		try {
			await withdrawAsync({
				path: { documentId: documentId.value },
				body: {},
			});
			showSuccess('Withdrawn for revision. Draft editing is available again.');
		}
		catch(withdrawError) {
			actionError.value = getApiErrorMessage(withdrawError, 'Failed to withdraw and revise');
		}
	}

	async function onSupersede(): Promise<string | null> {
		clearActionFeedback();
		try {
			const successor = await supersedeAsync({
				path: { documentId: documentId.value },
				body: {},
			});
			showSuccess('Successor draft opened for supersession.');
			return successor.id;
		}
		catch(supersedeError) {
			actionError.value = getApiErrorMessage(supersedeError, 'Failed to supersede');
			return null;
		}
	}

	async function onAbandonSupersede(): Promise<void> {
		clearActionFeedback();
		try {
			await abandonSupersedeAsync({
				path: { documentId: documentId.value },
				body: {},
			});
			showSuccess('Supersede successor abandoned. A new supersede can be opened on the prior published document.');
		}
		catch(abandonError) {
			actionError.value = getApiErrorMessage(abandonError, 'Failed to abandon successor');
		}
	}

	async function onDecision(decision: 'approve' | 'reject'): Promise<void> {
		clearActionFeedback();
		const step = activeStep.value;
		if (!step || step.status !== 'pending') {
			actionError.value = 'No pending approval step. Claim a pool step first if needed.';
			return;
		}
		try {
			await decideStepAsync({
				path: {
					documentId: documentId.value,
					stepId: step.id,
				},
				body: {
					decision,
					comment: forms.decisionForm.comment || undefined,
				},
			});
			showSuccess(decision === 'approve' ? 'Approval recorded.' : 'Document rejected.');
		}
		catch(decisionError) {
			actionError.value = getApiErrorMessage(decisionError, 'Failed to record decision');
		}
	}

	async function onPublish(): Promise<void> {
		clearActionFeedback();
		if (!document.value) {
			return;
		}
		try {
			const body: PublishRequest = {
				publishDestinationId: forms.publishForm.publishDestinationId ?? undefined,
				folderPathOverride: forms.publishForm.folderPathOverride || undefined,
			};
			const result = await publishApprovedDocument({
				document: document.value,
				publishDestinationId: body.publishDestinationId,
				folderPathOverride: body.folderPathOverride,
				publishApi: async(publishBody) => {
					const published = await publishPdfAsync({
						path: { documentId: documentId.value },
						body: publishBody,
					});
					return {
						sharePointUrl: published.sharePointUrl,
						pdfFileName: published.pdfFileName,
						sharePointItemId: published.sharePointItemId,
						idempotent: published.idempotent,
					};
				},
			});
			forms.markPublishClean();
			showSuccess(
				result.idempotent
					? `Already published (same revision): ${result.sharePointUrl}`
					: `Published to SharePoint: ${result.sharePointUrl}`,
			);
		}
		catch(publishError) {
			actionError.value = getApiErrorMessage(publishError, 'Failed to publish PDF');
		}
	}

	return {
		actionError,
		hasDraftRevisionConflict,
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
	};
}
