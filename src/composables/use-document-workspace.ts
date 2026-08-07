import type { Ref } from 'vue';
import type { PublishRequest } from '@/client/types.gen';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, ref } from 'vue';
import { getApiErrorCode, getApiErrorMessage } from '@/api/api-error';
import {
	abandonSupersedeMutation,
	claimApprovalStepMutation,
	decideApprovalStepMutation,
	getDocumentQuery,
	getDocumentQueryKey,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
	listLibraryDocumentsQueryKey,
	listPublishDestinationsQuery,
	processApprovalSlaMutation,
	publishDocumentPdfMutation,
	releaseApprovalStepMutation,
	submitForApprovalMutation,
	supersedeDocumentMutation,
	updateDocumentDraftMutation,
	withdrawAndReviseMutation,
} from '@/client/@pinia/colada.gen';
import { useDocumentFormState } from '@/composables/use-document-form-state';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { useToast } from '@/composables/use-toast';
import { getDocumentType } from '@/config/document-types';
import { isEmailInPool } from '@/domain/approval-queue';
import { canActorEditDraft, canActorMutateDraft } from '@/domain/document-access';
import { publishApprovedDocument } from '@/publishing/publish-document';
import { buildRevisionPdfFileName } from '@/publishing/publish-engine';
import { useIdentityStore } from '@/stores/identity';

/**
 * Document workspace queries, form state, capabilities, and command handlers.
 */
export function useDocumentWorkspace(documentId: Ref<string>) {
	const queryCache = useQueryCache();
	const { context, canAct } = usePowerAppsContext();
	const identity = useIdentityStore();
	const toast = useToast();
	const actionError = ref<string | null>(null);
	const hasDraftRevisionConflict = ref(false);

	const { data: document, isPending, error, refetch } = useQuery(() =>
		getDocumentQuery({
			path: { documentId: documentId.value },
		}),
	);

	const { data: typesData } = useQuery(() => listDocumentTypesQuery());
	const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());

	const activeDestinationIds = computed(() =>
		(destinationsData.value?.items ?? [])
			.filter((item) => item.active)
			.map((item) => item.id),
	);

	const forms = useDocumentFormState({
		document,
		documentId,
		types: computed(() => typesData.value?.items),
		activeDestinationIds,
		fallbackType: getDocumentType,
	});

	const documentType = computed(() => {
		const fromApi = typesData.value?.items?.find(
			(item) => item.id === document.value?.documentType,
		);
		if (fromApi) {
			return fromApi;
		}
		return getDocumentType(document.value?.documentType);
	});

	const approvalChainPreview = computed(() => {
		const type = typesData.value?.items?.find(
			(item) => item.id === document.value?.documentType,
		);
		return type?.approvalChain ?? [];
	});

	const destinationItems = computed(() =>
		(destinationsData.value?.items ?? [])
			.filter((item) => item.active)
			.map((item) => ({
				title: `${item.name} · ${item.libraryName}`,
				value: item.id,
				subtitle: item.siteUrl,
			})),
	);

	const selectedDestination = computed(() =>
		destinationsData.value?.items?.find(
			(item) => item.id === forms.publishForm.publishDestinationId,
		) ?? null,
	);

	const previewFileName = computed(() => {
		if (!document.value) {
			return '';
		}
		const revision
			= document.value.submittedContentRevision
				?? document.value.contentRevision
				?? 0;
		return buildRevisionPdfFileName(document.value.id, revision, document.value.title);
	});

	const activeStep = computed(
		() =>
			document.value?.approvalSteps.find(
				(step) => step.status === 'queued' || step.status === 'pending',
			) ?? null,
	);

	async function invalidateDocumentQueries(): Promise<void> {
		await Promise.all([
			queryCache.invalidateQueries({
				key: getDocumentQueryKey({ path: { documentId: documentId.value } }),
			}),
			queryCache.invalidateQueries({ key: listDocumentsQueryKey() }),
		]);
	}

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
			await invalidateDocumentQueries();
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

	const canDraft = computed(() => {
		const doc = document.value;
		const actor = context.value.email;
		if (!canAct.value || !doc || !actor) {
			return false;
		}
		return canActorEditDraft(
			{
				...doc,
				collaboratorEmails: doc.collaboratorEmails ?? [],
				currentPoolEmails: doc.currentPoolEmails ?? [],
				approvalSteps: doc.approvalSteps ?? [],
			},
			actor,
		);
	});

	const canSubmitApproval = computed(() => {
		const doc = document.value;
		const actor = context.value.email;
		if (!canAct.value || !doc || !actor || doc.status !== 'drafting') {
			return false;
		}
		return canActorMutateDraft(
			{
				requesterEmail: doc.requesterEmail,
				authorEmail: doc.authorEmail,
				collaboratorEmails: doc.collaboratorEmails ?? [],
			},
			actor,
		);
	});
	const canClaim = computed(() => {
		const step = activeStep.value;
		const actor = context.value.email;
		return Boolean(
			canAct.value
			&& step?.status === 'queued'
			&& actor
			&& isEmailInPool(step.pool ?? [], actor),
		);
	});
	const canRelease = computed(() => {
		const step = activeStep.value;
		const actor = (context.value.email || '').toLowerCase();
		return Boolean(
			canAct.value
			&& step?.status === 'pending'
			&& step.assignmentMode === 'pool'
			&& step.approverEmail?.toLowerCase() === actor,
		);
	});
	const canDecide = computed(
		() =>
			Boolean(canAct.value)
			&& activeStep.value?.status === 'pending'
			&& activeStep.value.approverEmail?.toLowerCase()
			=== (context.value.email || '').toLowerCase(),
	);
	const canPublish = computed(
		() =>
			Boolean(canAct.value)
			&& (document.value?.status === 'approved' || document.value?.status === 'published')
			&& (identity.hasRole('publisher') || identity.hasRole('admin'))
			&& Boolean(forms.publishForm.publishDestinationId),
	);
	const canProcessSla = computed(
		() =>
			Boolean(canAct.value)
			&& document.value?.status === 'in_review'
			&& identity.hasRole('admin'),
	);
	const canWithdraw = computed(() => {
		const status = document.value?.status;
		const actor = (context.value.email || '').toLowerCase();
		if (!canAct.value || !document.value || !actor) {
			return false;
		}
		if (status !== 'in_review' && status !== 'rejected' && status !== 'approved') {
			return false;
		}
		return (
			document.value.requesterEmail.toLowerCase() === actor
			|| document.value.authorEmail?.toLowerCase() === actor
			|| (document.value.collaboratorEmails ?? []).some(
				(email) => email.toLowerCase() === actor,
			)
		);
	});

	const canSupersede = computed(() => {
		const doc = document.value;
		const actor = (context.value.email || '').toLowerCase();
		if (!canAct.value || !doc || doc.status !== 'published' || !actor) {
			return false;
		}
		if (identity.hasRole('admin')) {
			return true;
		}
		return (
			doc.requesterEmail.toLowerCase() === actor
			|| doc.authorEmail?.toLowerCase() === actor
			|| (doc.collaboratorEmails ?? []).some((email) => email.toLowerCase() === actor)
		);
	});

	const canAbandonSupersede = computed(() => {
		const doc = document.value;
		const actor = (context.value.email || '').toLowerCase();
		if (!canAct.value || !doc || !actor || !doc.supersedesDocumentId) {
			return false;
		}
		if (!['requested', 'drafting', 'in_review', 'approved'].includes(doc.status)) {
			return false;
		}
		if (identity.hasRole('admin')) {
			return true;
		}
		return (
			doc.requesterEmail.toLowerCase() === actor
			|| doc.authorEmail?.toLowerCase() === actor
			|| (doc.collaboratorEmails ?? []).some((email) => email.toLowerCase() === actor)
		);
	});

	const publishedLibraryPath = computed(() => {
		const number = document.value?.documentNumber;
		if (!number || (document.value?.status !== 'published' && document.value?.status !== 'superseded')) {
			return null;
		}
		return { name: 'library-document' as const, params: { documentNumber: number } };
	});

	return {
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
		...forms,
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
	};
}
