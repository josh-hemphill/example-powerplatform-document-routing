<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import {
	FREEFORM_MIN_LENGTH,
	freeformRequestRules,
	TITLE_MAX_LENGTH,
	TITLE_MIN_LENGTH,
	titleRules,
} from '@/api/form-rules';
import {
	createDocumentRequestMutation,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
} from '@/client/@pinia/colada.gen';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { DEFAULT_DOCUMENT_TYPE_ID } from '@/config/document-types';

const router = useRouter();
const queryCache = useQueryCache();
const { context, canAct, isLoading: identityLoading } = usePowerAppsContext();
const formError = ref<string | null>(null);
const formValid = ref(false);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
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
	freeformRequest: '',
	priority: 'normal' as 'low' | 'normal' | 'high',
});

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

	try {
		const document = await mutateAsync({
			body: {
				title: form.title.trim(),
				documentType: form.documentType,
				freeformRequest: form.freeformRequest.trim(),
				priority: form.priority,
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
	<v-card class="pa-6">
		<p class="text-body-2 text-medium-emphasis mb-6">
			Capture an unstructured request. Requester is the signed-in principal
			(<strong>{{ context.email ?? '…' }}</strong>). The document type chooses the draft
			scaffold, author collaboration team, default approval chain, and allowlisted publish destination.
		</p>

		<v-alert
			v-if="formError"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			{{ formError }}
		</v-alert>

		<v-form v-model="formValid" @submit.prevent="submit">
			<v-row>
				<v-col cols="12" md="8">
					<v-text-field
						v-model="form.title"
						label="Request title"
						:rules="titleRules('Request title')"
						counter="200"
						maxlength="200"
						required
					/>
				</v-col>
				<v-col cols="12" md="4">
					<v-select
						v-model="form.priority"
						:items="[
							{ title: 'Low', value: 'low' },
							{ title: 'Normal', value: 'normal' },
							{ title: 'High', value: 'high' },
						]"
						label="Priority"
					/>
				</v-col>
				<v-col cols="12" md="6">
					<v-select
						v-model="form.documentType"
						:items="typeItems"
						item-title="title"
						item-value="value"
						label="Document type"
					/>
				</v-col>
				<v-col cols="12" md="6" class="d-flex align-center">
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ selectedType?.description }}
					</p>
				</v-col>
				<v-col cols="12">
					<v-textarea
						v-model="form.freeformRequest"
						label="Freeform request"
						rows="8"
						:rules="freeformRequestRules()"
						:hint="selectedType?.requestHint"
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
					:disabled="!canAct || !formValid"
				>
					Submit request
				</v-btn>
			</div>
		</v-form>
	</v-card>
</template>
