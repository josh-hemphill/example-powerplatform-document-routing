<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
	claimApprovalStepMutation,
	decideApprovalStepMutation,
	getDocumentQuery,
	getDocumentQueryKey,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
	listPublishDestinationsQuery,
	processApprovalSlaMutation,
	publishDocumentPdfMutation,
	releaseApprovalStepMutation,
	submitForApprovalMutation,
	updateDocumentDraftMutation,
	withdrawAndReviseMutation,
} from '@/client/@pinia/colada.gen';
import ApprovalStepper from '@/components/ApprovalStepper.vue';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import WorkflowTimeline from '@/components/WorkflowTimeline.vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { buildDraftFromTemplate, getDocumentType } from '@/config/document-types';
import { isEmailInPool } from '@/domain/approval-queue';
import { publishApprovedDocument } from '@/publishing/publish-document';
import { buildRevisionPdfFileName } from '@/publishing/publish-engine';
import { useIdentityStore } from '@/stores/identity';

const route = useRoute();
const queryCache = useQueryCache();
const { context, canAct } = usePowerAppsContext();
const identity = useIdentityStore();
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);

const documentId = computed(() => String(route.params.documentId));

const { data: document, isPending, error, refetch } = useQuery(() =>
	getDocumentQuery({
		path: { documentId: documentId.value },
	}),
);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());
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

const draftForm = reactive({
	title: '',
	bodyMarkdown: '',
	summary: '',
});

const approvalForm = reactive({
	comment: '',
});

const decisionForm = reactive({
	comment: '',
});

const publishForm = reactive({
	publishDestinationId: null as string | null,
	folderPathOverride: '',
});

const selectedDestination = computed(() =>
	destinationsData.value?.items?.find(
		(item) => item.id === publishForm.publishDestinationId,
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

watch(
	[document, typesData, destinationsData],
	() => {
		const value = document.value;
		if (!value) {
			return;
		}
		const type = getDocumentType(value.documentType);
		const live = typesData.value?.items?.find((item) => item.id === value.documentType);
		draftForm.title = value.title;
		draftForm.bodyMarkdown
			= value.draftBodyMarkdown
				?? buildDraftFromTemplate(
					live
						? {
								...type,
								draftTemplate: live.draftTemplate,
								label: live.label,
							}
						: type,
					value.title,
					value.freeformRequest,
				);
		draftForm.summary = value.draftSummary ?? '';
		const typeDefault = typesData.value?.items?.find(
			(item) => item.id === value.documentType,
		)?.defaultDestinationId;
		const activeDestinations = (destinationsData.value?.items ?? []).filter(
			(item) => item.active,
		);
		publishForm.publishDestinationId
			= typeDefault
				?? activeDestinations[0]?.id
				?? null;
		publishForm.folderPathOverride = '';
	},
	{ immediate: true },
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

const { mutateAsync: publishPdfAsync, isLoading: isPublishingPdf } = useMutation({
	...publishDocumentPdfMutation(),
	async onSettled() {
		await invalidateDocumentQueries();
	},
});

async function onSaveDraft(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	if (!canAct.value) {
		actionError.value = 'Sign-in identity is required.';
		return;
	}
	try {
		await saveDraftAsync({
			path: { documentId: documentId.value },
			body: {
				title: draftForm.title,
				bodyMarkdown: draftForm.bodyMarkdown,
				summary: draftForm.summary || undefined,
			},
		});
		actionSuccess.value = 'Draft saved. Ready for the approval chain when content is complete.';
	}
	catch(saveError) {
		actionError.value = saveError instanceof Error ? saveError.message : 'Failed to save draft';
	}
}

async function onSubmitForApproval(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	try {
		// Chain materializes from control tables unless Admin enables override.
		await submitApprovalAsync({
			path: { documentId: documentId.value },
			body: {
				comment: approvalForm.comment || undefined,
			},
		});
		actionSuccess.value = 'Submitted to the approval chain.';
	}
	catch(submitError) {
		actionError.value
			= submitError instanceof Error ? submitError.message : 'Failed to submit for approval';
	}
}

async function onClaim(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
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
		actionSuccess.value = 'Step claimed. You can approve or reject.';
	}
	catch(claimError) {
		actionError.value
			= claimError instanceof Error ? claimError.message : 'Failed to claim step';
	}
}

async function onRelease(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
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
		actionSuccess.value = 'Returned to the pool queue.';
	}
	catch(releaseError) {
		actionError.value
			= releaseError instanceof Error ? releaseError.message : 'Failed to release step';
	}
}

async function onProcessSla(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	try {
		await processSlaAsync({
			path: { documentId: documentId.value },
			body: {},
		});
		actionSuccess.value = 'SLA processor ran (elevates overdue steps when due).';
	}
	catch(slaError) {
		actionError.value
			= slaError instanceof Error ? slaError.message : 'Failed to process SLA';
	}
}

async function onWithdrawAndRevise(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	try {
		await withdrawAsync({
			path: { documentId: documentId.value },
			body: {},
		});
		actionSuccess.value = 'Withdrawn for revision. Draft editing is available again.';
	}
	catch(withdrawError) {
		actionError.value
			= withdrawError instanceof Error
				? withdrawError.message
				: 'Failed to withdraw and revise';
	}
}

async function onDecision(decision: 'approve' | 'reject'): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
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
				comment: decisionForm.comment || undefined,
			},
		});
		actionSuccess.value
			= decision === 'approve' ? 'Approval recorded.' : 'Document rejected.';
	}
	catch(decisionError) {
		actionError.value
			= decisionError instanceof Error ? decisionError.message : 'Failed to record decision';
	}
}

async function onPublish(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	if (!document.value) {
		return;
	}

	try {
		const result = await publishApprovedDocument({
			document: document.value,
			publishDestinationId: publishForm.publishDestinationId ?? undefined,
			folderPathOverride: publishForm.folderPathOverride || undefined,
			publishApi: async(body) => {
				const published = await publishPdfAsync({
					path: { documentId: documentId.value },
					body,
				});
				return {
					sharePointUrl: published.sharePointUrl,
					pdfFileName: published.pdfFileName,
					sharePointItemId: published.sharePointItemId,
					idempotent: published.idempotent,
				};
			},
		});

		actionSuccess.value = result.idempotent
			? `Already published (same revision): ${result.sharePointUrl}`
			: `Published to SharePoint: ${result.sharePointUrl}`;
	}
	catch(publishError) {
		actionError.value
			= publishError instanceof Error ? publishError.message : 'Failed to publish PDF';
	}
}

const canDraft = computed(
	() =>
		Boolean(canAct.value)
		&& document.value
		&& ['requested', 'drafting'].includes(document.value.status),
);

const canSubmitApproval = computed(
	() => Boolean(canAct.value) && document.value?.status === 'drafting',
);
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
		&& Boolean(publishForm.publishDestinationId),
);
const canProcessSla = computed(
	() => Boolean(canAct.value) && document.value?.status === 'in_review',
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
</script>

<template>
	<div>
		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			{{ error instanceof Error ? error.message : 'Failed to load document' }}
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
			<v-card class="pa-4 mb-4">
				<div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-2">
					<div>
						<div class="text-h6 font-weight-bold">
							{{ document.title }}
						</div>
						<div class="text-body-2 text-medium-emphasis">
							{{ documentType.label }} · Requested by {{ document.requesterEmail }}
						</div>
					</div>
					<div class="d-flex align-center ga-2">
						<DocumentStatusChip :status="document.status" />
						<v-btn size="small" variant="tonal" @click="() => refetch()">
							Refresh
						</v-btn>
					</div>
				</div>
				<WorkflowTimeline :status="document.status" />
			</v-card>

			<v-row>
				<v-col cols="12" md="7">
					<v-card class="pa-4 mb-4">
						<div class="text-subtitle-1 font-weight-bold mb-2">
							1. Freeform request
						</div>
						<p class="markdown-preview mb-0">
							{{ document.freeformRequest }}
						</p>
					</v-card>

					<v-card class="pa-4 mb-4">
						<div class="text-subtitle-1 font-weight-bold mb-3">
							2. Author / draft
						</div>
						<p class="text-body-2 text-medium-emphasis mb-2">
							Signed in as {{ context.email }}. Collaborative authors on this type can co-edit before submit.
						</p>
						<v-text-field v-model="draftForm.title" label="Document title" class="mb-2" />
						<v-text-field
							:model-value="document.authorEmail ?? '—'"
							label="Author (from principal on first save)"
							readonly
							disabled
							class="mb-2"
						/>
						<v-text-field v-model="draftForm.summary" label="Short summary" class="mb-2" />
						<v-textarea
							v-model="draftForm.bodyMarkdown"
							label="Draft (Markdown)"
							rows="12"
							class="mb-3"
						/>
						<v-btn
							color="secondary"
							:disabled="!canDraft"
							:loading="isSavingDraft"
							@click="onSaveDraft"
						>
							Save draft
						</v-btn>
					</v-card>

					<v-card class="pa-4 mb-4">
						<div class="text-subtitle-1 font-weight-bold mb-3">
							3. Approval chain
						</div>
						<template v-if="document.approvalSteps.length === 0">
							<p class="text-body-2 text-medium-emphasis mb-3">
								Chain comes from Admin control data for
								<strong>{{ documentType.label }}</strong> (named and/or pool + SLA).
							</p>
							<v-list density="compact" class="mb-3 bg-transparent">
								<v-list-item
									v-for="step in approvalChainPreview"
									:key="step.order"
								>
									<v-list-item-title>
										Step {{ step.order }} ·
										{{ step.assignmentMode === 'pool' ? `${step.role} (pool ${step.poolKey ?? '—'})` : `${step.assignee?.displayName ?? 'Named'} (${step.role})` }}
									</v-list-item-title>
									<v-list-item-subtitle>
										{{ step.assignmentMode === 'pool' ? `Pool · SLA ${step.slaHours ?? '—'}h` : `Named · SLA ${step.slaHours ?? '—'}h` }}
									</v-list-item-subtitle>
								</v-list-item>
							</v-list>
							<v-text-field v-model="approvalForm.comment" label="Submission comment" class="mb-3" />
							<v-btn
								color="warning"
								:disabled="!canSubmitApproval"
								:loading="isSubmittingApproval"
								@click="onSubmitForApproval"
							>
								Submit for approval
							</v-btn>
						</template>
						<template v-else>
							<ApprovalStepper :steps="document.approvalSteps" />
							<div class="mt-4">
								<p class="text-body-2 text-medium-emphasis mb-2">
									Acting as signed-in principal: <strong>{{ context.email }}</strong>
									(switch persona in the app bar for local demos).
								</p>
								<v-text-field v-model="decisionForm.comment" label="Comment" class="mb-3" />
								<div class="d-flex flex-wrap ga-2">
									<v-btn
										color="info"
										:disabled="!canClaim"
										:loading="isClaiming"
										@click="onClaim"
									>
										Claim from pool
									</v-btn>
									<v-btn
										variant="tonal"
										:disabled="!canRelease"
										:loading="isReleasing"
										@click="onRelease"
									>
										Release to queue
									</v-btn>
									<v-btn
										color="success"
										:disabled="!canDecide"
										:loading="isDecidingStep"
										@click="onDecision('approve')"
									>
										Approve step
									</v-btn>
									<v-btn
										color="error"
										variant="tonal"
										:disabled="!canDecide"
										:loading="isDecidingStep"
										@click="onDecision('reject')"
									>
										Reject
									</v-btn>
									<v-btn
										variant="outlined"
										:disabled="!canProcessSla"
										:loading="isProcessingSla"
										@click="onProcessSla"
									>
										Process SLA
									</v-btn>
									<v-btn
										variant="tonal"
										color="secondary"
										:disabled="!canWithdraw"
										:loading="isWithdrawing"
										@click="onWithdrawAndRevise"
									>
										Withdraw &amp; revise
									</v-btn>
								</div>
							</div>
						</template>
					</v-card>

					<v-card class="pa-4">
						<div class="text-subtitle-1 font-weight-bold mb-3">
							4. Publish PDF to SharePoint
						</div>
						<p class="text-body-2 text-medium-emphasis mb-3">
							Publish runs server-side / via Flow against an allowlisted destination.
							The browser never uploads PDF bytes.
						</p>
						<v-select
							v-model="publishForm.publishDestinationId"
							:items="destinationItems"
							item-title="title"
							item-value="value"
							label="Publish destination"
							class="mb-2"
						/>
						<v-text-field
							v-model="publishForm.folderPathOverride"
							label="Folder override (optional, under destination root)"
							:hint="selectedDestination ? `Root: ${selectedDestination.folderPath}` : undefined"
							persistent-hint
							class="mb-2"
						/>
						<v-text-field
							:model-value="previewFileName"
							label="PDF file name (id + revision)"
							readonly
							disabled
							class="mb-3"
						/>
						<v-btn
							color="primary"
							:disabled="!canPublish"
							:loading="isPublishingPdf"
							@click="onPublish"
						>
							Publish PDF
						</v-btn>
						<div v-if="document.publishedPdfUrl" class="mt-3">
							<a :href="document.publishedPdfUrl" target="_blank" rel="noreferrer">
								{{ document.publishedPdfUrl }}
							</a>
						</div>
					</v-card>
				</v-col>

				<v-col cols="12" md="5">
					<v-card class="pa-4 mb-4">
						<div class="text-subtitle-1 font-weight-bold mb-2">
							History
						</div>
						<v-timeline density="compact" side="end">
							<v-timeline-item
								v-for="event in document.history"
								:key="event.id"
								size="small"
								dot-color="primary"
							>
								<div class="text-caption text-medium-emphasis">
									{{ new Date(event.at).toLocaleString() }}
								</div>
								<div class="font-weight-medium">
									{{ event.action }}
								</div>
								<div class="text-body-2">
									{{ event.message }}
								</div>
								<div class="text-caption">
									{{ event.actorEmail }}
								</div>
							</v-timeline-item>
						</v-timeline>
					</v-card>

					<v-card class="pa-4">
						<div class="text-subtitle-1 font-weight-bold mb-2">
							Draft preview
						</div>
						<pre class="markdown-preview text-body-2 mb-0">{{ draftForm.bodyMarkdown || 'No draft yet.' }}</pre>
					</v-card>
				</v-col>
			</v-row>
		</template>
	</div>
</template>
