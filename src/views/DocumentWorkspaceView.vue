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
import {
	buildDraftFromTemplate,
	getDocumentType,
	toApprovalStepInputs,
} from '@/config/document-types';
import { isEmailInPool } from '@/domain/approval-queue';
import { resolvePublishTargets } from '@/publishing/html-pdf-template';
import { publishApprovedDocument } from '@/publishing/publish-document';

const route = useRoute();
const queryCache = useQueryCache();
const { context, canAct } = usePowerAppsContext();
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);

const documentId = computed(() => String(route.params.documentId));

const { data: document, isPending, error, refetch } = useQuery(() =>
	getDocumentQuery({
		path: { documentId: documentId.value },
	}),
);

const documentType = computed(() => getDocumentType(document.value?.documentType));

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
	sharePointSiteUrl: '',
	libraryName: '',
	folderPath: '',
	fileName: '',
});

const activeStep = computed(
	() =>
		document.value?.approvalSteps.find(
			(step) => step.status === 'queued' || step.status === 'pending',
		) ?? null,
);

watch(
	document,
	(value) => {
		if (!value) {
			return;
		}
		const type = getDocumentType(value.documentType);
		draftForm.title = value.title;
		draftForm.bodyMarkdown
			= value.draftBodyMarkdown
				?? buildDraftFromTemplate(type, value.title, value.freeformRequest);
		draftForm.summary = value.draftSummary ?? '';
		const targets = resolvePublishTargets(value);
		publishForm.sharePointSiteUrl = targets.siteUrl;
		publishForm.libraryName = targets.libraryName;
		publishForm.folderPath = targets.folderPath;
		publishForm.fileName = targets.fileName;
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
		const steps = toApprovalStepInputs(documentType.value.approvalChain);
		await submitApprovalAsync({
			path: { documentId: documentId.value },
			body: {
				steps,
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
		actionSuccess.value = 'Withdrawn for revision. Draft editing is available again.'
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
			targets: { ...publishForm },
			publishApi: async(body) => {
				const published = await publishPdfAsync({
					path: { documentId: documentId.value },
					body,
				});
				return {
					sharePointUrl: published.sharePointUrl,
					pdfFileName: published.pdfFileName,
					sharePointItemId: published.sharePointItemId,
				};
			},
		});

		actionSuccess.value = `Published to SharePoint: ${result.sharePointUrl}`;
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
	() => Boolean(canAct.value) && document.value?.status === 'approved',
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
								Chain comes from <code>document-types.ts</code> for
								<strong>{{ documentType.label }}</strong> (named and/or pool + SLA).
							</p>
							<v-list density="compact" class="mb-3 bg-transparent">
								<v-list-item
									v-for="(step, index) in documentType.approvalChain"
									:key="index"
								>
									<v-list-item-title>
										Step {{ index + 1 }} ·
										{{ step.mode === 'pool' ? step.poolRole : `${step.displayName} (${step.role})` }}
									</v-list-item-title>
									<v-list-item-subtitle>
										{{ step.mode === 'pool' ? `Pool · SLA ${step.slaHours}h` : `Named · SLA ${step.slaHours ?? '—'}h` }}
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
						<v-text-field
							v-model="publishForm.sharePointSiteUrl"
							label="SharePoint site URL"
							class="mb-2"
						/>
						<v-text-field v-model="publishForm.libraryName" label="Library name" class="mb-2" />
						<v-text-field v-model="publishForm.folderPath" label="Folder path" class="mb-2" />
						<v-text-field
							v-model="publishForm.fileName"
							label="PDF file name"
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
