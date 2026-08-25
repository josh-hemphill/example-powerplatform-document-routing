<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import {
	getDocumentByNumberQuery,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
	listLibraryDocumentsQueryKey,
	supersedeDocumentMutation,
} from '@/client/@pinia/colada.gen';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import MarkdownPreview from '@/components/MarkdownPreview.vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';
import { useDocumentTypeLabel } from '@/composables/use-document-type-label';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { useToast } from '@/composables/use-toast';
import { canActorSupersedeDocument } from '@/domain/document-access';
import { useIdentityStore } from '@/stores/identity';

const route = useRoute();
const router = useRouter();
const queryCache = useQueryCache();
const { context, canAct } = usePowerAppsContext();
const identity = useIdentityStore();
const { confirm } = useConfirmDialog();
const toast = useToast();

const documentNumber = computed(() => String(route.params.documentNumber));
const actionError = ref<string | null>(null);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
const { typeLabel } = useDocumentTypeLabel(() => typesData.value?.items);

const { data: document, isPending, error, refetch } = useQuery(() =>
	getDocumentByNumberQuery({
		path: { documentNumber: documentNumber.value },
	}),
);

const { mutateAsync: supersedeAsync, isLoading: isSuperseding } = useMutation({
	...supersedeDocumentMutation(),
	async onSettled() {
		await Promise.all([
			queryCache.invalidateQueries({ key: listLibraryDocumentsQueryKey() }),
			queryCache.invalidateQueries({ key: listDocumentsQueryKey() }),
		]);
	},
});

const canSupersede = computed(() => {
	const doc = document.value;
	if (!doc) {
		return false;
	}
	return canActorSupersedeDocument(doc, context.value.email ?? '', {
		canAct: canAct.value,
		isAdmin: identity.hasRole('admin'),
	});
});

async function onSupersede(): Promise<void> {
	actionError.value = null;
	if (!document.value) {
		return;
	}
	const ok = await confirm({
		title: 'Supersede with a new case?',
		message: 'Opens a drafting successor. This published document stays current until the successor publishes.',
		confirmText: 'Supersede',
		color: 'primary',
	});
	if (!ok) {
		return;
	}
	try {
		const successor = await supersedeAsync({
			path: { documentId: document.value.id },
			body: {},
		});
		toast.success('Successor draft opened.');
		await router.push({ name: 'document', params: { documentId: successor.id } });
	}
	catch(supersedeError) {
		actionError.value = getApiErrorMessage(supersedeError, 'Failed to supersede');
	}
}
</script>

<template>
	<div>
		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
			role="alert"
		>
			<div class="d-flex flex-wrap align-center justify-space-between ga-3">
				<div>
					{{ getApiErrorMessage(error, 'Failed to load published document') }}
				</div>
				<div class="d-flex flex-wrap ga-2">
					<v-btn size="small" variant="tonal" @click="() => refetch()">
						Retry
					</v-btn>
					<v-btn size="small" variant="text" :to="{ name: 'library' }">
						Back to library
					</v-btn>
				</div>
			</div>
		</v-alert>

		<v-alert
			v-if="actionError"
			type="error"
			variant="tonal"
			class="mb-4"
			role="alert"
		>
			{{ actionError }}
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="article, actions" />

		<template v-else-if="document">
			<header class="published-header mb-4">
				<div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-2">
					<div>
						<div class="text-overline text-medium-emphasis">
							{{ document.documentNumber }} · v{{ document.documentVersion }}
						</div>
						<h1 class="text-h5 font-weight-bold">
							{{ document.title }}
						</h1>
						<div class="text-body-2 text-medium-emphasis">
							{{ typeLabel(document.documentType) }} · Published
							{{ document.publishedAt ? new Date(document.publishedAt).toLocaleString() : '—' }}
						</div>
					</div>
					<div class="d-flex align-center ga-2 flex-wrap">
						<DocumentStatusChip :status="document.status" />
						<v-btn
							v-if="document.publishedPdfUrl"
							:href="document.publishedPdfUrl"
							target="_blank"
							rel="noopener noreferrer"
							variant="tonal"
							size="small"
						>
							Open PDF
						</v-btn>
						<v-btn
							v-if="canSupersede"
							color="primary"
							size="small"
							:loading="isSuperseding"
							:disabled="!canAct"
							@click="onSupersede"
						>
							Supersede with new case
						</v-btn>
					</div>
				</div>

				<p class="text-body-1 mb-0">
					{{ document.draftSummary || 'Controlled published final — content is read-only.' }}
				</p>
			</header>

			<v-alert
				v-if="document.supersedesDocumentId"
				type="info"
				variant="tonal"
				class="mb-4"
			>
				<div class="text-subtitle-2 mb-1">
					Supersession trail
				</div>
				<p class="text-body-2 mb-0">
					This version replaces a prior controlled document (workspace case
					<RouterLink
						:to="{ name: 'document', params: { documentId: document.supersedesDocumentId } }"
					>
						{{ document.supersedesDocumentId.slice(0, 8) }}…
					</RouterLink>
					).
				</p>
			</v-alert>

			<MarkdownPreview
				class="mb-4"
				:source="document.draftBodyMarkdown"
				empty-text="—"
			/>

			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="text" :to="{ name: 'library' }">
					Back to library
				</v-btn>
				<v-btn
					variant="tonal"
					:to="{ name: 'document', params: { documentId: document.id } }"
				>
					Open workspace case
				</v-btn>
			</div>
		</template>
	</div>
</template>

<style scoped>
.published-header {
	padding-bottom: 1rem;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
</style>
