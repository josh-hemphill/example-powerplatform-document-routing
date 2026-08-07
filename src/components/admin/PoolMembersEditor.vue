<script setup lang="ts">
import type { Approver } from '@/client/types.gen';
import { ref } from 'vue';
import { createEmptyMember, editorRowKey, parseMembersJson } from '@/domain/control-editors';

const members = defineModel<Approver[]>({ required: true });

const showJson = ref(false);
const jsonDraft = ref('');
const jsonError = ref<string | null>(null);

function addMember(): void {
	members.value = [...members.value, createEmptyMember()];
}

function removeMember(index: number): void {
	const next = [...members.value];
	next.splice(index, 1);
	members.value = next;
}

function openJson(): void {
	jsonDraft.value = JSON.stringify(members.value, null, 2);
	jsonError.value = null;
	showJson.value = true;
}

function applyJson(): void {
	const parsed = parseMembersJson(jsonDraft.value);
	if (!parsed.ok) {
		jsonError.value = parsed.error;
		return;
	}
	members.value = parsed.value;
	showJson.value = false;
	jsonError.value = null;
}
</script>

<template>
	<div>
		<div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
			<div class="text-subtitle-2 font-weight-bold">
				Pool members
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
					@click="addMember"
				>
					Add member
				</v-btn>
			</div>
		</div>

		<div
			v-for="(member, index) in members"
			:key="editorRowKey(member)"
			class="d-flex flex-wrap align-start ga-2 mb-2"
		>
			<v-text-field
				v-model="member.email"
				label="Email"
				class="flex-grow-1"
				hide-details
				style="min-width: 12rem"
			/>
			<v-text-field
				v-model="member.displayName"
				label="Display name"
				class="flex-grow-1"
				hide-details
				style="min-width: 12rem"
			/>
			<v-btn
				icon="$deleteOutline"
				variant="text"
				color="error"
				aria-label="Remove member"
				@click="removeMember(index)"
			/>
		</div>

		<p
			v-if="members.length === 0"
			class="text-body-2 text-medium-emphasis mb-0"
		>
			No members yet. Add a member or import JSON.
		</p>

		<v-dialog
			v-model="showJson"
			max-width="720"
			persistent
		>
			<v-card class="pa-2">
				<v-card-title class="text-h6">
					Edit members JSON
				</v-card-title>
				<v-card-text>
					<p class="text-body-2 text-medium-emphasis mb-3">
						Expert escape hatch. Invalid JSON will not be applied.
					</p>
					<v-textarea
						v-model="jsonDraft"
						label="Members JSON"
						rows="12"
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
