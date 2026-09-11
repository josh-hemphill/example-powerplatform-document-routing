<script setup lang="ts">
import type { TypeRequestField } from '@/client/types.gen';
import { computed, ref } from 'vue';
import {
	createEmptyRequestField,
	createEmptyRequestFieldOption,
	editorRowKey,
} from '@/domain/control-editors';
import {
	TYPE_REQUEST_FIELD_KEY_PATTERN,
	validateRequestFields,
} from '@/domain/type-request-fields';

const fields = defineModel<TypeRequestField[]>({ required: true });
const expandedRow = ref<number | null>(null);
const keyHint = 'Identifier used in {{fieldKey}} templates';
const fieldKeyPlaceholder = '{{fieldKey}}';
const unlockedFields = new WeakSet<TypeRequestField>();

const fieldsError = computed(() => validateRequestFields(fields.value)?.message ?? null);

function isKeyLocked(field: TypeRequestField): boolean {
	return !unlockedFields.has(field);
}

function keyError(field: TypeRequestField): string | undefined {
	const key = field.key.trim();
	if (!key || !TYPE_REQUEST_FIELD_KEY_PATTERN.test(key)) {
		return 'Use an identifier like relevantSystems';
	}
	return undefined;
}

function addField(): void {
	const next = createEmptyRequestField(`field_${fields.value.length + 1}`);
	unlockedFields.add(next);
	fields.value = [...fields.value, next];
	expandedRow.value = editorRowKey(next);
}

function removeField(index: number): void {
	const next = [...fields.value];
	next.splice(index, 1);
	fields.value = next;
	expandedRow.value = null;
}

function addOption(field: TypeRequestField): void {
	const count = (field.options ?? []).length + 1;
	field.options = [
		...(field.options ?? []),
		createEmptyRequestFieldOption(`option_${count}`, `Option ${count}`),
	];
}

function removeOption(field: TypeRequestField, optionIndex: number): void {
	field.options = (field.options ?? []).filter((_, index) => index !== optionIndex);
}

function toggleExpand(field: TypeRequestField): void {
	const identity = editorRowKey(field);
	expandedRow.value = expandedRow.value === identity ? null : identity;
}
</script>

<template>
	<div class="mt-6">
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<div class="text-subtitle-2 font-weight-bold">
				Request fields
			</div>
			<v-btn
				size="small"
				color="primary"
				variant="tonal"
				prepend-icon="$plus"
				@click="addField"
			>
				Add field
			</v-btn>
		</div>
		<p class="text-body-2 text-medium-emphasis mb-3">
			Optional dropdowns collected on create. Use
			<code>{{ fieldKeyPlaceholder }}</code>
			in the draft scaffold to insert the selected label. Keys stay fixed after save so in-flight cases keep their answers.
		</p>
		<v-alert
			v-if="fieldsError"
			type="warning"
			variant="tonal"
			density="compact"
			class="mb-3"
		>
			{{ fieldsError }}
		</v-alert>
		<p
			v-if="fields.length === 0"
			class="text-body-2 text-medium-emphasis mb-0"
		>
			No extra intake fields. Authors only fill the freeform request.
		</p>
		<div
			v-for="(field, index) in fields"
			:key="editorRowKey(field)"
			class="mb-4 pa-3"
			style="border: 1px solid rgba(var(--v-theme-on-surface), 0.12); border-radius: 8px"
		>
			<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
				<div class="text-body-2 font-weight-medium">
					{{ field.label || field.key || 'Field' }}
					<span
						v-if="field.required"
						class="text-caption text-medium-emphasis ms-2"
					>(required)</span>
				</div>
				<div class="d-flex flex-wrap ga-1">
					<v-btn
						size="small"
						variant="text"
						@click="toggleExpand(field)"
					>
						{{ expandedRow === editorRowKey(field) ? 'Collapse' : 'Edit' }}
					</v-btn>
					<v-btn
						size="small"
						variant="text"
						color="warning"
						@click="removeField(index)"
					>
						Remove
					</v-btn>
				</div>
			</div>
			<v-expand-transition>
				<div v-if="expandedRow === editorRowKey(field)">
					<v-row dense>
						<v-col cols="12" md="4">
							<v-text-field
								v-model="field.key"
								label="Key"
								:hint="keyHint"
								persistent-hint
								:disabled="isKeyLocked(field)"
								:error-messages="keyError(field)"
							/>
						</v-col>
						<v-col cols="12" md="4">
							<v-text-field
								v-model="field.label"
								label="Label"
								hide-details
							/>
						</v-col>
						<v-col cols="12" md="4">
							<v-select
								:model-value="field.kind"
								:items="[{ title: 'Select', value: 'select' }]"
								label="Kind"
								disabled
								hide-details
							/>
						</v-col>
						<v-col cols="12">
							<v-switch
								v-model="field.required"
								color="primary"
								label="Required on create"
								hide-details
							/>
						</v-col>
					</v-row>
					<div class="text-caption font-weight-medium mt-4 mb-2">
						Options
					</div>
					<v-row
						v-for="(option, optionIndex) in field.options ?? []"
						:key="`${editorRowKey(field)}-opt-${optionIndex}`"
						dense
						class="mb-1"
					>
						<v-col cols="12" md="5">
							<v-text-field
								v-model="option.value"
								label="Value"
								hide-details
							/>
						</v-col>
						<v-col cols="12" md="5">
							<v-text-field
								v-model="option.label"
								label="Label"
								hide-details
							/>
						</v-col>
						<v-col cols="12" md="2" class="d-flex align-center">
							<v-btn
								size="small"
								variant="text"
								color="warning"
								:disabled="(field.options?.length ?? 0) <= 1"
								@click="removeOption(field, optionIndex)"
							>
								Remove
							</v-btn>
						</v-col>
					</v-row>
					<v-btn
						size="small"
						variant="tonal"
						prepend-icon="$plus"
						class="mt-2"
						@click="addOption(field)"
					>
						Add option
					</v-btn>
				</div>
			</v-expand-transition>
		</div>
	</div>
</template>
