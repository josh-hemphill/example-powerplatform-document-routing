<script setup lang="ts">
import type { ControlChainStep } from '@/client/types.gen';
import { ref } from 'vue';
import {
	createEmptyChainStep,
	editorRowKey,
	moveChainStep,
	normalizeChainOrders,
	parseChainJson,
} from '@/domain/control-editors';

const props = defineProps<{
	poolKeys: Array<{ title: string; value: string }>;
}>();

const steps = defineModel<ControlChainStep[]>({ required: true });

const showJson = ref(false);
const jsonDraft = ref('');
const jsonError = ref<string | null>(null);

const assignmentModes = [
	{ title: 'Named', value: 'named' },
	{ title: 'Pool', value: 'pool' },
];

const authorityLevels = [
	{ title: 'Advisory', value: 'advisory' },
	{ title: 'Standard', value: 'standard' },
	{ title: 'Authoritative', value: 'authoritative' },
];

const commentPolicies = [
	{ title: 'Optional', value: 'optional' },
	{ title: 'Required on reject', value: 'required_on_reject' },
	{ title: 'Required on any decision', value: 'required_on_decision' },
];

function addStep(): void {
	steps.value = normalizeChainOrders([
		...steps.value,
		createEmptyChainStep(steps.value.length + 1),
	]);
}

function removeStep(index: number): void {
	const next = [...steps.value];
	next.splice(index, 1);
	steps.value = normalizeChainOrders(next);
}

function move(index: number, direction: -1 | 1): void {
	steps.value = moveChainStep(steps.value, index, direction);
}

function onModeChange(step: ControlChainStep): void {
	if (step.assignmentMode === 'named') {
		step.poolKey = undefined;
		step.assignee ??= { email: '', displayName: '' };
	}
	else {
		step.assignee = undefined;
	}
}

function openJson(): void {
	jsonDraft.value = JSON.stringify(steps.value, null, 2);
	jsonError.value = null;
	showJson.value = true;
}

function applyJson(): void {
	const parsed = parseChainJson(jsonDraft.value);
	if (!parsed.ok) {
		jsonError.value = parsed.error;
		return;
	}
	steps.value = parsed.value;
	showJson.value = false;
	jsonError.value = null;
}
</script>

<template>
	<div>
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<div class="text-subtitle-2 font-weight-bold">
				Approval chain
			</div>
			<div class="d-flex flex-wrap ga-2">
				<v-btn
					size="small"
					variant="tonal"
					prepend-icon="$codeJson"
					@click="openJson"
				>
					JSON
				</v-btn>
				<v-btn
					size="small"
					color="primary"
					variant="tonal"
					prepend-icon="$plus"
					@click="addStep"
				>
					Add step
				</v-btn>
			</div>
		</div>

		<div
			v-for="(step, index) in steps"
			:key="editorRowKey(step)"
			class="mb-4 pa-3"
			style="border: 1px solid rgba(var(--v-theme-on-surface), 0.12); border-radius: 8px"
		>
			<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
				<div class="text-body-2 font-weight-medium">
					Step {{ step.order }}
				</div>
				<div class="d-flex flex-wrap ga-1">
					<v-btn
						icon="$chevronUp"
						size="small"
						variant="text"
						:disabled="index === 0"
						aria-label="Move step up"
						@click="move(index, -1)"
					/>
					<v-btn
						icon="$chevronDown"
						size="small"
						variant="text"
						:disabled="index === steps.length - 1"
						aria-label="Move step down"
						@click="move(index, 1)"
					/>
					<v-btn
						icon="$deleteOutline"
						size="small"
						variant="text"
						color="error"
						:disabled="steps.length <= 1"
						aria-label="Remove step"
						@click="removeStep(index)"
					/>
				</div>
			</div>

			<v-row dense>
				<v-col cols="12" md="4">
					<v-select
						v-model="step.assignmentMode"
						:items="assignmentModes"
						label="Assignment"
						hide-details
						@update:model-value="onModeChange(step)"
					/>
				</v-col>
				<v-col cols="12" md="4">
					<v-text-field
						v-model="step.role"
						label="Role label"
						hide-details
					/>
				</v-col>
				<v-col cols="12" md="4">
					<v-text-field
						v-model.number="step.slaHours"
						label="SLA hours"
						type="number"
						min="1"
						hide-details
					/>
				</v-col>

				<template v-if="step.assignmentMode === 'named'">
					<v-col cols="12" md="6">
						<v-text-field
							:model-value="step.assignee?.email ?? ''"
							label="Assignee email"
							hide-details
							@update:model-value="(value) => {
								step.assignee = {
									email: String(value ?? ''),
									displayName: step.assignee?.displayName ?? '',
								}
							}"
						/>
					</v-col>
					<v-col cols="12" md="6">
						<v-text-field
							:model-value="step.assignee?.displayName ?? ''"
							label="Assignee display name"
							hide-details
							@update:model-value="(value) => {
								step.assignee = {
									email: step.assignee?.email ?? '',
									displayName: String(value ?? ''),
								}
							}"
						/>
					</v-col>
				</template>

				<template v-else>
					<v-col cols="12" md="6">
						<v-select
							v-model="step.poolKey"
							:items="poolKeys"
							label="Pool key"
							clearable
							hide-details
						/>
					</v-col>
				</template>

				<v-col cols="12" md="6">
					<v-select
						v-model="step.elevationPoolKey"
						:items="poolKeys"
						label="Elevation pool (optional)"
						clearable
						hide-details
					/>
				</v-col>
				<v-col cols="12" md="3">
					<v-select
						v-model="step.authorityLevel"
						:items="authorityLevels"
						label="Authority"
						hide-details
					/>
				</v-col>
				<v-col cols="12" md="3">
					<v-select
						v-model="step.commentPolicy"
						:items="commentPolicies"
						label="Comment policy"
						hide-details
					/>
				</v-col>
			</v-row>
		</div>

		<p
			v-if="steps.length === 0"
			class="text-body-2 text-medium-emphasis mb-3"
		>
			No steps yet. Add a step or import JSON.
		</p>

		<p class="text-caption text-medium-emphasis mb-0">
			Pool keys available:
			{{ props.poolKeys.map((item) => item.value).join(', ') || '—' }}
		</p>

		<v-dialog
			v-model="showJson"
			max-width="720"
			persistent
		>
			<v-card class="pa-2">
				<v-card-title class="text-h6">
					Edit approval chain JSON
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Expert escape hatch. Invalid JSON will not be applied.
					</p>
					<v-textarea
						v-model="jsonDraft"
						label="Approval chain JSON"
						rows="14"
						auto-grow
					/>
					<v-alert
						v-if="jsonError"
						type="error"
						variant="tonal"
						class="mt-2"
						density="compact"
					>
						{{ jsonError }}
					</v-alert>
				</v-card-text>
				<v-card-actions class="justify-end flex-wrap ga-2">
					<v-btn
						variant="text"
						@click="showJson = false"
					>
						Cancel
					</v-btn>
					<v-btn
						color="primary"
						variant="flat"
						@click="applyJson"
					>
						Apply JSON
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>
