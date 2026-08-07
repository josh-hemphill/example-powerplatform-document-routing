<script setup lang="ts">
import { APPROVAL_STEP_STATUS_LABELS } from '@/domain/approval-queue';

defineProps<{
	steps: Array<{
		id: string;
		order: number;
		assignmentMode: 'named' | 'pool';
		approverDisplayName?: string | null;
		approverEmail?: string | null;
		role?: string | null;
		status: 'waiting' | 'queued' | 'pending' | 'approved' | 'rejected' | 'skipped';
		dueAt?: string | null;
		elevated?: boolean;
		pool?: Array<{ displayName: string; email: string }>;
		comment?: string | null;
	}>;
}>();

const statusIcon: Record<string, string> = {
	waiting: '$timerSand',
	queued: '$accountMultipleOutline',
	pending: '$clockOutline',
	approved: '$checkCircle',
	rejected: '$closeCircle',
	skipped: '$minusCircle',
};

const statusColor: Record<string, string> = {
	waiting: 'default',
	queued: 'info',
	pending: 'warning',
	approved: 'success',
	rejected: 'error',
	skipped: 'default',
};

function formatDue(dueAt: string | null | undefined): string {
	if (!dueAt) {
		return '';
	}
	const due = new Date(dueAt);
	const overdue = due.getTime() < Date.now();
	return `${overdue ? 'Overdue' : 'Due'} ${due.toLocaleString()}`;
}
</script>

<template>
	<v-list
		lines="three"
		class="bg-transparent pa-0"
		aria-label="Approval steps"
		role="list"
	>
		<v-list-item
			v-for="step in steps"
			:key="step.id"
			class="px-0"
			role="listitem"
		>
			<template #prepend>
				<v-avatar
					:color="statusColor[step.status]"
					variant="tonal"
					size="36"
					aria-hidden="true"
				>
					<v-icon
						:icon="statusIcon[step.status]"
						size="20"
						aria-hidden="true"
					/>
				</v-avatar>
			</template>
			<v-list-item-title>
				Step {{ step.order }} ·
				{{
					step.assignmentMode === 'pool' && step.status === 'queued'
						? (step.role || 'Pool')
						: (step.approverDisplayName || step.role || 'Approver')
				}}
				<v-chip
					v-if="step.elevated"
					size="x-small"
					color="error"
					variant="tonal"
					class="ms-2"
				>
					Elevated
				</v-chip>
			</v-list-item-title>
			<v-list-item-subtitle>
				{{ step.assignmentMode === 'pool' ? 'Pool' : 'Named' }}
				· {{ APPROVAL_STEP_STATUS_LABELS[step.status] }}
				<span v-if="step.approverEmail"> · {{ step.approverEmail }}</span>
				<span v-if="step.status === 'queued' && step.pool?.length">
					· {{ step.pool.length }} eligible
				</span>
			</v-list-item-subtitle>
			<v-list-item-subtitle v-if="step.dueAt || step.comment">
				<span v-if="step.dueAt">{{ formatDue(step.dueAt) }}</span>
				<span v-if="step.comment"> · “{{ step.comment }}”</span>
			</v-list-item-subtitle>
		</v-list-item>
	</v-list>
</template>
