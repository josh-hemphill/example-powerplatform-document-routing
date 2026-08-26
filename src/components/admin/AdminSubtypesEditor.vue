<script setup lang="ts">
import type { ControlChainStep, DocumentSubtype } from '@/client/types.gen';
import { ref } from 'vue';
import ApprovalChainEditor from '@/components/admin/ApprovalChainEditor.vue';
import { createEmptySubtype, editorRowKey } from '@/domain/control-editors';

const props = defineProps<{
	documentTypeId: string;
	poolKeys: Array<{ title: string; value: string }>;
}>();

const subtypes = defineModel<DocumentSubtype[]>({ required: true });
const expandedId = ref<string | null>(null);

function addSubtype(): void {
	const next = createEmptySubtype(props.documentTypeId, `subtype_${subtypes.value.length + 1}`);
	subtypes.value = [...subtypes.value, next];
	expandedId.value = next.id;
}

function deactivate(index: number): void {
	const next = [...subtypes.value];
	next[index] = { ...next[index], active: false };
	subtypes.value = next;
}

function activate(index: number): void {
	const next = [...subtypes.value];
	next[index] = { ...next[index], active: true };
	subtypes.value = next;
}

function setUsesOwnChain(subtype: DocumentSubtype, value: boolean): void {
	subtype.usesOwnChain = value;
	if (value && (!subtype.approvalChain || subtype.approvalChain.length === 0)) {
		subtype.approvalChain = [];
	}
}

function chainModel(subtype: DocumentSubtype): ControlChainStep[] {
	return subtype.approvalChain ?? [];
}

function setChain(subtype: DocumentSubtype, value: ControlChainStep[]): void {
	subtype.approvalChain = value;
}
</script>

<template>
	<div class="mt-6">
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<div class="text-subtitle-2 font-weight-bold">
				Subtypes
			</div>
			<v-btn
				size="small"
				color="primary"
				variant="tonal"
				prepend-icon="$plus"
				@click="addSubtype"
			>
				Add subtype
			</v-btn>
		</div>
		<p class="text-body-2 text-medium-emphasis mb-3">
			If any subtype is active, authors must pick one on create. Own-chain subtypes
			replace the type chain at the next submit; otherwise they inherit.
		</p>
		<p
			v-if="subtypes.length === 0"
			class="text-body-2 text-medium-emphasis mb-0"
		>
			No subtypes. This type stays a single-select create form (like Announcement).
		</p>
		<div
			v-for="(subtype, index) in subtypes"
			:key="editorRowKey(subtype)"
			class="mb-4 pa-3"
			style="border: 1px solid rgba(var(--v-theme-on-surface), 0.12); border-radius: 8px"
		>
			<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
				<div class="text-body-2 font-weight-medium">
					{{ subtype.label || subtype.key || 'Subtype' }}
					<span
						v-if="!subtype.active"
						class="text-caption text-medium-emphasis ms-2"
					>(inactive)</span>
				</div>
				<div class="d-flex flex-wrap ga-1">
					<v-btn
						size="small"
						variant="text"
						@click="expandedId = expandedId === subtype.id ? null : subtype.id"
					>
						{{ expandedId === subtype.id ? 'Collapse' : 'Edit' }}
					</v-btn>
					<v-btn
						v-if="subtype.active"
						size="small"
						variant="text"
						color="warning"
						@click="deactivate(index)"
					>
						Deactivate
					</v-btn>
					<v-btn
						v-else
						size="small"
						variant="text"
						@click="activate(index)"
					>
						Reactivate
					</v-btn>
				</div>
			</div>
			<v-expand-transition>
				<div v-if="expandedId === subtype.id">
					<v-row dense>
						<v-col cols="12" md="4">
							<v-text-field
								v-model="subtype.key"
								label="Key"
								:disabled="!subtype.id.startsWith('new:')"
								hide-details
							/>
						</v-col>
						<v-col cols="12" md="4">
							<v-text-field
								v-model="subtype.label"
								label="Label"
								hide-details
							/>
						</v-col>
						<v-col cols="12" md="4">
							<v-text-field
								v-model="subtype.numberPrefix"
								label="Number prefix override"
								hide-details
								clearable
							/>
						</v-col>
						<v-col cols="12">
							<v-text-field
								v-model="subtype.description"
								label="Description"
								hide-details
							/>
						</v-col>
						<v-col cols="12">
							<v-text-field
								v-model="subtype.requestHint"
								label="Request hint override"
								hide-details
							/>
						</v-col>
						<v-col cols="12">
							<v-textarea
								v-model="subtype.draftScaffold"
								label="Draft scaffold override"
								rows="4"
								hide-details
							/>
						</v-col>
						<v-col cols="12">
							<v-switch
								:model-value="subtype.usesOwnChain"
								color="primary"
								label="Use own approval chain"
								hide-details
								@update:model-value="(value) => setUsesOwnChain(subtype, Boolean(value))"
							/>
						</v-col>
					</v-row>
					<ApprovalChainEditor
						v-if="subtype.usesOwnChain"
						:model-value="chainModel(subtype)"
						:pool-keys="poolKeys"
						class="mt-4"
						@update:model-value="(value) => setChain(subtype, value)"
					/>
				</div>
			</v-expand-transition>
		</div>
	</div>
</template>
