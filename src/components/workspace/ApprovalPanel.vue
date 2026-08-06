<script setup lang="ts">
import type { ApprovalStep, ControlChainStep, Document } from '@/client/types.gen';
import ApprovalStepper from '@/components/ApprovalStepper.vue';

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
}>();
const emit = defineEmits<{
	submit: [];
	claim: [];
	release: [];
	approve: [];
	reject: [];
	processSla: [];
	withdraw: [];
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
		<div class="text-subtitle-1 font-weight-bold mb-3">
			3. Approval chain
		</div>
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
				:disabled="!canSubmitApproval"
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
				<div class="d-flex flex-wrap ga-2">
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
					<v-btn
						color="success"
						:disabled="!canDecide"
						:loading="isDecidingStep"
						@click="emit('approve')"
					>
						Approve step
					</v-btn>
					<v-btn
						color="error"
						variant="tonal"
						:disabled="!canDecide"
						:loading="isDecidingStep"
						@click="emit('reject')"
					>
						Reject
					</v-btn>
					<v-btn
						variant="outlined"
						:disabled="!canProcessSla"
						:loading="isProcessingSla"
						@click="emit('processSla')"
					>
						Process SLA
					</v-btn>
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
			</div>
		</template>
	</v-card>
</template>
