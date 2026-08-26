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
	acknowledgeReviewCommentMutation,
	claimApprovalStepMutation,
	decideApprovalStepMutation,
	getDocumentQueryKey,
	listLibraryDocumentsQueryKey,
	processApprovalSlaMutation,
	publishDocumentPdfMutation,
	releaseApprovalStepMutation,
	respondToReviewCommentMutation,
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

	function settledInvalidator(forDocumentId: string, invalidateList = true) {
		return async() => {
			if (invalidateList) {
				await invalidateDocumentQueries(forDocumentId);
				return;
			}
			await queryCache.invalidateQueries({
				key: getDocumentQueryKey({ path: { documentId: forDocumentId } }),
			});
		};
	}

	const { mutateAsync: saveDraftAsync, isLoading: isSavingDraft } = useMutation(
		updateDocumentDraftMutation(),
	);

	const { mutateAsync: submitApprovalAsync, isLoading: isSubmittingApproval }
		= useMutation(submitForApprovalMutation());

	const { mutateAsync: decideStepAsync, isLoading: isDecidingStep } = useMutation(
		decideApprovalStepMutation(),
	);

	const { mutateAsync: claimStepAsync, isLoading: isClaiming } = useMutation(
		claimApprovalStepMutation(),
	);

	const { mutateAsync: releaseStepAsync, isLoading: isReleasing } = useMutation(
		releaseApprovalStepMutation(),
	);

	const { mutateAsync: processSlaAsync, isLoading: isProcessingSla } = useMutation(
		processApprovalSlaMutation(),
	);

	const { mutateAsync: withdrawAsync, isLoading: isWithdrawing } = useMutation(
		withdrawAndReviseMutation(),
	);

	const { mutateAsync: respondCommentAsync, isLoading: isRespondingToReview }
		= useMutation(respondToReviewCommentMutation());

	const { mutateAsync: acknowledgeCommentAsync, isLoading: isAcknowledgingReview }
		= useMutation(acknowledgeReviewCommentMutation());

	const { mutateAsync: supersedeAsync, isLoading: isSuperseding } = useMutation(
		supersedeDocumentMutation(),
	);

	const { mutateAsync: abandonSupersedeAsync, isLoading: isAbandoningSupersede }
		= useMutation(abandonSupersedeMutation());

	const { mutateAsync: publishPdfAsync, isLoading: isPublishingPdf } = useMutation(
		publishDocumentPdfMutation(),
	);

	async function runDocumentMutation<T>(
		forDocumentId: string,
		action: () => Promise<T>,
		options: { alsoInvalidateLibrary?: boolean; invalidateList?: boolean } = {},
	): Promise<T> {
		try {
			return await action();
		}
		finally {
			await settledInvalidator(
				forDocumentId,
				options.invalidateList !== false,
			)();
			if (options.alsoInvalidateLibrary) {
				await queryCache.invalidateQueries({ key: listLibraryDocumentsQueryKey() });
			}
		}
	}

	function clearActionFeedback(): void {
		actionError.value = null;
		hasDraftRevisionConflict.value = false;
	}

	function showSuccess(message: string): void {
		toast.success(message);
	}

	/** True when the workspace is still on the document this mutation targeted. */
	function isCurrentDocument(id: string): boolean {
		return documentId.value === id;
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
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				saveDraftAsync({
					path: { documentId: id },
					body: {
						title: forms.draftForm.title,
						bodyMarkdown: forms.draftForm.bodyMarkdown,
						summary: forms.draftForm.summary || undefined,
						expectedContentRevision: document.value!.contentRevision,
					},
				}), { invalidateList: false });
			if (!isCurrentDocument(id)) {
				return;
			}
			forms.markDraftClean();
			showSuccess('Draft saved. Ready for the approval chain when content is complete.');
		}
		catch(saveError) {
			if (!isCurrentDocument(id)) {
				return;
			}
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
		const id = documentId.value;
		hasDraftRevisionConflict.value = false;
		actionError.value = null;
		await refetch();
		if (!isCurrentDocument(id)) {
			return;
		}
		forms.hydrateFromDocument(true);
		showSuccess('Draft reloaded from the server.');
	}

	async function onSubmitForApproval(): Promise<void> {
		clearActionFeedback();
		if (forms.isDraftDirty.value) {
			actionError.value = 'Save your draft before submitting for approval.';
			return;
		}
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				submitApprovalAsync({
					path: { documentId: id },
					body: {
						comment: forms.approvalForm.comment || undefined,
					},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			forms.clearActionComments();
			showSuccess('Submitted to the approval chain.');
		}
		catch(submitError) {
			if (!isCurrentDocument(id)) {
				return;
			}
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
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				claimStepAsync({
					path: { documentId: id, stepId: step.id },
					body: {},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('Step claimed. You can approve or reject.');
		}
		catch(claimError) {
			if (!isCurrentDocument(id)) {
				return;
			}
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
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				releaseStepAsync({
					path: { documentId: id, stepId: step.id },
					body: {},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('Returned to the pool queue.');
		}
		catch(releaseError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(releaseError, 'Failed to release step');
		}
	}

	async function onProcessSla(): Promise<void> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				processSlaAsync({
					path: { documentId: id },
					body: {},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('SLA processor ran (elevates overdue steps when due).');
		}
		catch(slaError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(slaError, 'Failed to process SLA');
		}
	}

	async function onWithdrawAndRevise(): Promise<void> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				withdrawAsync({
					path: { documentId: id },
					body: {},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('Withdrawn for revision. Draft editing is available again.');
		}
		catch(withdrawError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(withdrawError, 'Failed to withdraw and revise');
		}
	}

	async function onSupersede(): Promise<string | null> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			const successor = await runDocumentMutation(
				id,
				async() =>
					supersedeAsync({
						path: { documentId: id },
						body: {},
					}),
				{ alsoInvalidateLibrary: true },
			);
			if (isCurrentDocument(id)) {
				showSuccess('Successor draft opened for supersession.');
			}
			return successor.id;
		}
		catch(supersedeError) {
			if (!isCurrentDocument(id)) {
				return null;
			}
			actionError.value = getApiErrorMessage(supersedeError, 'Failed to supersede');
			return null;
		}
	}

	async function onAbandonSupersede(): Promise<void> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			await runDocumentMutation(
				id,
				async() =>
					abandonSupersedeAsync({
						path: { documentId: id },
						body: {},
					}),
				{ alsoInvalidateLibrary: true },
			);
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('Supersede successor abandoned. A new supersede can be opened on the prior published document.');
		}
		catch(abandonError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(abandonError, 'Failed to abandon successor');
		}
	}

	async function onRespondToReview(commentId: string, body: string): Promise<void> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				respondCommentAsync({
					path: { documentId: id, commentId },
					body: { body },
				}), { invalidateList: false });
			if (!isCurrentDocument(id)) {
				return;
			}
			forms.clearReviewResponseDraft(commentId);
			showSuccess('Response saved. Authoritative comments no longer block resubmit once addressed.');
		}
		catch(respondError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(respondError, 'Failed to save response');
		}
	}

	async function onAcknowledgeReview(commentId: string): Promise<void> {
		clearActionFeedback();
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				acknowledgeCommentAsync({
					path: { documentId: id, commentId },
					body: {},
				}), { invalidateList: false });
			if (!isCurrentDocument(id)) {
				return;
			}
			showSuccess('Comment acknowledged.');
		}
		catch(acknowledgeError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(acknowledgeError, 'Failed to acknowledge comment');
		}
	}

	async function onDecision(decision: 'approve' | 'reject'): Promise<void> {
		clearActionFeedback();
		const step = activeStep.value;
		if (!step || step.status !== 'pending') {
			actionError.value = 'No pending approval step. Claim a pool step first if needed.';
			return;
		}
		const id = documentId.value;
		try {
			await runDocumentMutation(id, async() =>
				decideStepAsync({
					path: {
						documentId: id,
						stepId: step.id,
					},
					body: {
						decision,
						comment: forms.decisionForm.comment || undefined,
					},
				}));
			if (!isCurrentDocument(id)) {
				return;
			}
			forms.clearActionComments();
			showSuccess(decision === 'approve' ? 'Approval recorded.' : 'Document rejected.');
		}
		catch(decisionError) {
			if (!isCurrentDocument(id)) {
				return;
			}
			actionError.value = getApiErrorMessage(decisionError, 'Failed to record decision');
		}
	}

	async function onPublish(): Promise<void> {
		clearActionFeedback();
		if (!document.value) {
			return;
		}
		const id = documentId.value;
		try {
			const body: PublishRequest = {
				publishDestinationId: forms.publishForm.publishDestinationId ?? undefined,
				folderPathOverride: forms.publishForm.folderPathOverride || undefined,
			};
			const result = await runDocumentMutation(
				id,
				async() =>
					publishApprovedDocument({
						document: document.value!,
						publishDestinationId: body.publishDestinationId,
						folderPathOverride: body.folderPathOverride,
						publishApi: async(publishBody) => {
							const published = await publishPdfAsync({
								path: { documentId: id },
								body: publishBody,
							});
							return {
								sharePointUrl: published.sharePointUrl,
								pdfFileName: published.pdfFileName,
								sharePointItemId: published.sharePointItemId,
								idempotent: published.idempotent,
							};
						},
					}),
				{ alsoInvalidateLibrary: true },
			);
			if (!isCurrentDocument(id)) {
				return;
			}
			forms.markPublishClean();
			showSuccess(
				result.idempotent
					? `Already published (same revision): ${result.sharePointUrl}`
					: `Published to SharePoint: ${result.sharePointUrl}`,
			);
		}
		catch(publishError) {
			if (!isCurrentDocument(id)) {
				return;
			}
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
		isRespondingToReview,
		isAcknowledgingReview,
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
		onRespondToReview,
		onAcknowledgeReview,
		onSupersede,
		onAbandonSupersede,
		onDecision,
		onPublish,
	};
}
