<script setup lang="ts">
import type { ApprovalStep, ControlChainStep, Document } from '@/client/types.gen';
import ApprovalStepper from '@/components/ApprovalStepper.vue';
import { DOCUMENT_STATUS_LABELS } from '@/domain/document-status';

defineProps<{
	document: Document;
	typeLabel: string;
	approvalChainPreview: ControlChainStep[];
	actorEmail: string | null | undefined;
	canSubmitApproval: boolean;
	canClaim: boolean;
	canRelease: boolean;
	canDecide: boolean;
	canProcessSla: boolean;
	canWithdraw: boolean;
	isSubmittingApproval: boolean;
	isClaiming: boolean;
	isReleasing: boolean;
	isDecidingStep: boolean;
	isProcessingSla: boolean;
	isWithdrawing: boolean;
	expanded: boolean;
}>();
const emit = defineEmits<{
	submit: [];
	claim: [];
	release: [];
	approve: [];
	reject: [];
	processSla: [];
	withdraw: [];
	toggle: [];
}>();
const approvalComment = defineModel<string>('approvalComment', { required: true });
const decisionComment = defineModel<string>('decisionComment', { required: true });

function stepPreviewTitle(step: ControlChainStep): string {
	if (step.assignmentMode === 'pool') {
		return `Step ${step.order} · ${step.role} (pool ${step.poolKey ?? '—'})`;
	}
	return `Step ${step.order} · ${step.assignee?.displayName ?? 'Named'} (${step.role})`;
}

function stepPreviewSubtitle(step: ControlChainStep): string {
	const mode = step.assignmentMode === 'pool' ? 'Pool' : 'Named';
	return `${mode} · SLA ${step.slaHours ?? '—'}h`;
}

function hasSteps(steps: ApprovalStep[]): boolean {
	return steps.length > 0;
}
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between ga-2 mb-3">
			<button
				type="button"
				class="stage-toggle text-subtitle-1 font-weight-bold"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			>
				3. Approval chain
			</button>
			<v-btn
				variant="text"
				size="small"
				:icon="expanded ? '$chevronUp' : '$chevronDown'"
				:aria-label="expanded ? 'Collapse approval' : 'Expand approval'"
				:aria-expanded="expanded"
				@click="emit('toggle')"
			/>
		</div>
		<p
			v-if="!expanded"
			class="text-body-2 text-medium-emphasis mb-0"
		>
			{{ hasSteps(document.approvalSteps) ? `${document.approvalSteps.length} steps · ${DOCUMENT_STATUS_LABELS[document.status]}` : 'Not submitted yet' }}
		</p>
		<v-expand-transition>
			<div v-if="expanded">
				<template v-if="!hasSteps(document.approvalSteps)">
					<p class="text-body-2 text-medium-emphasis mb-3">
						Chain comes from Admin control data for
						<strong>{{ typeLabel }}</strong> (named and/or pool + SLA).
					</p>
					<v-list density="compact" class="mb-3 bg-transparent">
						<v-list-item
							v-for="step in approvalChainPreview"
							:key="step.order"
						>
							<v-list-item-title>
								{{ stepPreviewTitle(step) }}
							</v-list-item-title>
							<v-list-item-subtitle>
								{{ stepPreviewSubtitle(step) }}
							</v-list-item-subtitle>
						</v-list-item>
					</v-list>
					<v-text-field v-model="approvalComment" label="Submission comment" class="mb-3" />
					<v-btn
						color="warning"
						:disabled="!canSubmitApproval || isSubmittingApproval"
						:loading="isSubmittingApproval"
						@click="emit('submit')"
					>
						Submit for approval
					</v-btn>
				</template>
				<template v-else>
					<ApprovalStepper :steps="document.approvalSteps" />
					<div class="mt-4">
						<p class="text-body-2 text-medium-emphasis mb-2">
							Acting as signed-in principal: <strong>{{ actorEmail }}</strong>
							(switch persona in the app bar for local demos).
						</p>
						<v-text-field v-model="decisionComment" label="Comment" class="mb-3" />

						<div class="text-caption text-medium-emphasis mb-1">
							Queue
						</div>
						<div class="d-flex flex-wrap ga-2 mb-4">
							<v-btn
								color="info"
								:disabled="!canClaim"
								:loading="isClaiming"
								@click="emit('claim')"
							>
								Claim from pool
							</v-btn>
							<v-btn
								variant="tonal"
								:disabled="!canRelease"
								:loading="isReleasing"
								@click="emit('release')"
							>
								Release to queue
							</v-btn>
						</div>

						<div class="text-caption text-medium-emphasis mb-1">
							Decide
						</div>
						<div class="d-flex flex-wrap align-center ga-2 mb-4">
							<v-btn
								color="success"
								:disabled="!canDecide"
								:loading="isDecidingStep"
								@click="emit('approve')"
							>
								Approve step
							</v-btn>
							<v-divider
								vertical
								class="mx-1 d-none d-sm-flex"
								style="height: 28px"
							/>
							<v-btn
								color="error"
								variant="tonal"
								:disabled="!canDecide"
								:loading="isDecidingStep"
								@click="emit('reject')"
							>
								Reject
							</v-btn>
						</div>

						<div class="text-caption text-medium-emphasis mb-1">
							Revise
						</div>
						<div class="d-flex flex-wrap ga-2 mb-2">
							<v-btn
								variant="tonal"
								color="secondary"
								:disabled="!canWithdraw"
								:loading="isWithdrawing"
								@click="emit('withdraw')"
							>
								Withdraw &amp; revise
							</v-btn>
						</div>

						<div
							v-if="canProcessSla"
							class="mt-4 pt-3"
							style="border-top: 1px solid rgba(0, 0, 0, 0.08)"
						>
							<div class="text-caption text-medium-emphasis mb-1">
								Admin
							</div>
							<v-btn
								variant="outlined"
								size="small"
								:loading="isProcessingSla"
								@click="emit('processSla')"
							>
								Process SLA
							</v-btn>
						</div>
					</div>
				</template>
			</div>
		</v-expand-transition>
	</v-card>
</template>

<style scoped>
.stage-toggle {
	background: none;
	border: 0;
	padding: 0;
	cursor: pointer;
	text-align: start;
	color: inherit;
	font: inherit;
}

.stage-toggle:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}
</style>
