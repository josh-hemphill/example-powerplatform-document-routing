<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import {
	FREEFORM_MIN_LENGTH,
	freeformRequestRules,
	minLengthRule,
	TITLE_MAX_LENGTH,
	TITLE_MIN_LENGTH,
	titleRules,
} from '@/api/form-rules';
import {
	createDocumentRequestMutation,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
	listPriorityLevelsQuery,
} from '@/client/@pinia/colada.gen';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { DEFAULT_DOCUMENT_TYPE_ID } from '@/config/document-types';
import { DEFAULT_PRIORITY_KEY } from '@/domain/priority-catalog';

const router = useRouter();
const queryCache = useQueryCache();
const { context, canAct, isLoading: identityLoading } = usePowerAppsContext();
const formError = ref<string | null>(null);
const formValid = ref(false);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
const { data: priorityData } = useQuery(() => listPriorityLevelsQuery());

const typeItems = computed(() =>
	(typesData.value?.items ?? [])
		.filter((item) => item.active)
		.map((item) => ({
			title: item.label,
			value: item.id,
			subtitle: item.description,
		})),
);

const form = reactive({
	title: '',
	documentType: DEFAULT_DOCUMENT_TYPE_ID,
	documentSubtypeId: null as string | null,
	freeformRequest: '',
	priority: DEFAULT_PRIORITY_KEY,
	priorityReason: '',
	typeFieldValues: {} as Record<string, string>,
});

const requestTitleRules = titleRules('Request title');
const requestFreeformRules = freeformRequestRules();

watch(
	typeItems,
	(items) => {
		if (!items.some((item) => item.value === form.documentType) && items[0]) {
			form.documentType = items[0].value;
		}
	},
	{ immediate: true },
);

const selectedType = computed(
	() => typesData.value?.items?.find((item) => item.id === form.documentType) ?? null,
);

const subtypeItems = computed(() =>
	(selectedType.value?.subtypes ?? [])
		.filter((item) => item.active)
		.map((item) => ({
			title: item.label,
			value: item.key,
			subtitle: item.description,
		})),
);

const requiresSubtype = computed(() => subtypeItems.value.length > 0);

const selectedSubtype = computed(
	() =>
		selectedType.value?.subtypes?.find(
			(item) => item.key === form.documentSubtypeId || item.id === form.documentSubtypeId,
		) ?? null,
);

const requestFields = computed(() => selectedType.value?.requestFields ?? []);
const dispatchesToReview = computed(
	() => selectedType.value?.createWorkflow === 'dispatch_to_review',
);

watch(
	() => form.documentType,
	() => {
		form.documentSubtypeId = null;
		form.typeFieldValues = {};
	},
);

watch(
	subtypeItems,
	(items) => {
		if (!requiresSubtype.value) {
			form.documentSubtypeId = null;
			return;
		}
		if (form.documentSubtypeId && !items.some((item) => item.value === form.documentSubtypeId)) {
			form.documentSubtypeId = null;
		}
	},
);

const priorityItems = computed(() =>
	(priorityData.value?.items ?? [])
		.filter((item) => item.active)
		.map((item) => ({
			title: item.label,
			value: item.key,
		})),
);

const selectedPriority = computed(
	() =>
		(priorityData.value?.items ?? []).find((item) => item.key === form.priority) ?? null,
);

watch(
	priorityItems,
	(items) => {
		if (!items.some((item) => item.value === form.priority) && items[0]) {
			form.priority = items[0].value;
		}
	},
	{ immediate: true },
);

const requestHint = computed(
	() => selectedSubtype.value?.requestHint || selectedType.value?.requestHint,
);

const priorityReasonRules = computed(() => {
	const row = selectedPriority.value;
	if (!row?.requiresReason) {
		return [];
	}
	const minLength = Math.max(1, row.minReasonLength || 1);
	return [minLengthRule(minLength, 'Priority reason')];
});

const { mutateAsync, isLoading } = useMutation({
	...createDocumentRequestMutation(),
	async onSettled() {
		await queryCache.invalidateQueries({
			key: listDocumentsQueryKey(),
		});
	},
});

async function submit(): Promise<void> {
	formError.value = null;
	if (!canAct.value || !context.value.email) {
		formError.value = 'Sign-in identity is required before creating a request.';
		return;
	}
	if (!formValid.value) {
		formError.value = `Title (${TITLE_MIN_LENGTH}–${TITLE_MAX_LENGTH} chars) and freeform request (${FREEFORM_MIN_LENGTH}+ chars) are required.`;
		return;
	}
	if (requiresSubtype.value && !form.documentSubtypeId) {
		formError.value = 'This document type requires a subtype.';
		return;
	}
	const missingField = requestFields.value.find(
		(field) => field.required && !form.typeFieldValues[field.key]?.trim(),
	);
	if (missingField) {
		formError.value = `${missingField.label} is required.`;
		return;
	}

	try {
		const document = await mutateAsync({
			body: {
				title: form.title.trim(),
				documentType: form.documentType,
				freeformRequest: form.freeformRequest.trim(),
				priority: form.priority,
				priorityReason: form.priorityReason.trim() || undefined,
				documentSubtypeId: form.documentSubtypeId ?? undefined,
				typeFieldValues: requestFields.value.length
					? { ...form.typeFieldValues }
					: undefined,
			},
		});
		await router.push({ name: 'document', params: { documentId: document.id } });
	}
	catch(error) {
		formError.value = getApiErrorMessage(error, 'Failed to create request');
	}
}
</script>

<template>
	<div>
		<p class="text-body-2 text-medium-emphasis mb-6">
			Capture an unstructured request. Requester is the signed-in principal
			(<strong>{{ context.email ?? '…' }}</strong>). The document type chooses the draft
			scaffold, author collaboration team, default approval chain, and allowlisted publish destination.
			<span v-if="dispatchesToReview">
				This type goes straight to review — reviewers edit the official document from the workspace.
			</span>
		</p>

		<v-alert
			v-if="formError"
			type="error"
			variant="tonal"
			class="mb-4"
			role="alert"
		>
			{{ formError }}
		</v-alert>

		<v-form v-model="formValid" @submit.prevent="submit">
			<v-row>
				<v-col cols="12" md="8">
					<v-text-field
						v-model="form.title"
						label="Request title"
						:rules="requestTitleRules"
						:counter="TITLE_MAX_LENGTH"
						:maxlength="TITLE_MAX_LENGTH"
						required
					/>
				</v-col>
				<v-col cols="12" md="4">
					<v-select
						v-model="form.priority"
						:items="priorityItems"
						item-title="title"
						item-value="value"
						label="Priority"
					/>
				</v-col>
				<v-col
					v-if="selectedPriority?.requiresReason"
					cols="12"
				>
					<v-textarea
						v-model="form.priorityReason"
						:label="selectedPriority.reasonHint || 'Priority reason (required)'"
						:hint="selectedPriority.reasonHint"
						persistent-hint
						:rules="priorityReasonRules"
						rows="3"
						required
					/>
				</v-col>
				<v-col cols="12" :md="requiresSubtype ? 6 : 6">
					<v-select
						v-model="form.documentType"
						:items="typeItems"
						item-title="title"
						item-value="value"
						label="Document type"
					/>
				</v-col>
				<v-col
					v-if="requiresSubtype"
					cols="12"
					md="6"
				>
					<v-select
						v-model="form.documentSubtypeId"
						:items="subtypeItems"
						item-title="title"
						item-value="value"
						label="Subtype"
						:rules="[(value) => Boolean(value) || 'Subtype is required']"
						required
					/>
				</v-col>
				<v-col
					v-else
					cols="12"
					md="6"
					class="d-flex align-center"
				>
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ selectedType?.description }}
					</p>
				</v-col>
				<v-col
					v-if="requiresSubtype"
					cols="12"
				>
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ selectedSubtype?.description || selectedType?.description }}
					</p>
				</v-col>
				<v-col
					v-for="field in requestFields"
					:key="field.key"
					cols="12"
					md="6"
				>
					<v-select
						v-if="field.kind === 'select'"
						v-model="form.typeFieldValues[field.key]"
						:items="field.options ?? []"
						item-title="label"
						item-value="value"
						:label="field.label"
						:rules="field.required ? [(value) => Boolean(value) || `${field.label} is required`] : []"
						:required="Boolean(field.required)"
					/>
				</v-col>
				<v-col cols="12">
					<v-textarea
						v-model="form.freeformRequest"
						label="Freeform request"
						rows="8"
						:rules="requestFreeformRules"
						:hint="requestHint"
						persistent-hint
					/>
				</v-col>
				<v-col cols="12" md="6">
					<v-text-field
						:model-value="context.email"
						label="Requester (signed-in)"
						readonly
						disabled
					/>
				</v-col>
				<v-col cols="12" md="6" class="d-flex align-center">
					<p class="text-body-2 text-medium-emphasis mb-0">
						Publish destination is chosen from the Admin allowlist at publish time
						(document type default when set).
					</p>
				</v-col>
			</v-row>

			<div class="d-flex justify-end ga-2 mt-2">
				<v-btn variant="text" :to="{ name: 'inbox' }">
					Cancel
				</v-btn>
				<v-btn
					color="primary"
					type="submit"
					:loading="isLoading || identityLoading"
					:disabled="!canAct || !formValid || isLoading || identityLoading"
				>
					{{ dispatchesToReview ? 'Dispatch to review' : 'Submit request' }}
				</v-btn>
			</div>
		</v-form>
	</div>
</template>
