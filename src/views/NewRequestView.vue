<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
	createDocumentRequestMutation,
	listDocumentsQueryKey,
} from '@/client/@pinia/colada.gen';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { appConfig } from '@/config/app.config';
import {
	DEFAULT_DOCUMENT_TYPE_ID,
	documentTypeSelectItems,
	getDocumentType,
} from '@/config/document-types';

const router = useRouter();
const queryCache = useQueryCache();
const { context, canAct, isLoading: identityLoading } = usePowerAppsContext();
const formError = ref<string | null>(null);

const form = reactive({
	title: '',
	documentType: DEFAULT_DOCUMENT_TYPE_ID,
	freeformRequest: '',
	priority: 'normal' as 'low' | 'normal' | 'high',
	requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
	requestedLibraryName: appConfig.sharePoint.libraryName,
});

const selectedType = computed(() => getDocumentType(form.documentType));

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
	if (!form.title.trim() || form.freeformRequest.trim().length < 10) {
		formError.value = 'Title and a freeform request (10+ chars) are required.';
		return;
	}

	try {
		const document = await mutateAsync({
			body: {
				title: form.title.trim(),
				documentType: form.documentType,
				freeformRequest: form.freeformRequest.trim(),
				priority: form.priority,
				requestedPublishSiteUrl: form.requestedPublishSiteUrl,
				requestedLibraryName: form.requestedLibraryName,
			},
		});
		await router.push({ name: 'document', params: { documentId: document.id } });
	}
	catch(error) {
		formError.value = error instanceof Error ? error.message : 'Failed to create request';
	}
}
</script>

<template>
	<v-card class="pa-6">
		<p class="text-body-2 text-medium-emphasis mb-6">
			Capture an unstructured request. Requester is the signed-in principal
			(<strong>{{ context.email ?? '…' }}</strong>). The document type chooses the draft
			scaffold, author collaboration team, and default approval chain.
		</p>

		<v-alert
			v-if="formError"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			{{ formError }}
		</v-alert>

		<v-form @submit.prevent="submit">
			<v-row>
				<v-col cols="12" md="8">
					<v-text-field v-model="form.title" label="Request title" required />
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
						:items="documentTypeSelectItems()"
						item-title="title"
						item-value="value"
						label="Document type"
					/>
				</v-col>
				<v-col cols="12" md="6" class="d-flex align-center">
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ selectedType.description }}
					</p>
				</v-col>
				<v-col cols="12">
					<v-textarea
						v-model="form.freeformRequest"
						label="Freeform request"
						rows="8"
						:hint="selectedType.requestHint"
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
				<v-col cols="12" md="6">
					<v-text-field
						v-model="form.requestedLibraryName"
						label="Target SharePoint library"
					/>
				</v-col>
				<v-col cols="12">
					<v-text-field
						v-model="form.requestedPublishSiteUrl"
						label="Target SharePoint site URL"
					/>
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
					:disabled="!canAct"
				>
					Submit request
				</v-btn>
			</div>
		</v-form>
	</v-card>
</template>
