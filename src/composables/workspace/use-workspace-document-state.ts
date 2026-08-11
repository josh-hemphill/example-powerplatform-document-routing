/**
 * Workspace document query, control lookups, and form hydration.
 */
import type { Ref } from 'vue';
import { useQuery, useQueryCache } from '@pinia/colada';
import { computed } from 'vue';
import {
	getDocumentQuery,
	getDocumentQueryKey,
	listDocumentsQueryKey,
	listDocumentTypesQuery,
	listPublishDestinationsQuery,
} from '@/client/@pinia/colada.gen';
import { useDocumentFormState } from '@/composables/use-document-form-state';
import { getDocumentType } from '@/config/document-types';
import { buildRevisionPdfFileName } from '@/publishing/publish-engine';

/**
 * Loads the workspace document and related control data / forms.
 */
export function useWorkspaceDocumentState(documentId: Ref<string>) {
	const queryCache = useQueryCache();

	const { data: document, isPending, error, refetch } = useQuery(() =>
		getDocumentQuery({
			path: { documentId: documentId.value },
		}),
	);

	const { data: typesData } = useQuery(() => listDocumentTypesQuery());
	const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());

	const activeDestinationIds = computed(() =>
		(destinationsData.value?.items ?? [])
			.filter((item) => item.active)
			.map((item) => item.id),
	);

	const forms = useDocumentFormState({
		document,
		documentId,
		types: computed(() => typesData.value?.items),
		activeDestinationIds,
		// Bundled config is seed/fallback only; prefer control API types when present.
		fallbackType: getDocumentType,
	});

	const documentType = computed(() => {
		const fromApi = typesData.value?.items?.find(
			(item) => item.id === document.value?.documentType,
		);
		if (fromApi) {
			return fromApi;
		}
		return getDocumentType(document.value?.documentType);
	});

	const approvalChainPreview = computed(() => {
		const type = typesData.value?.items?.find(
			(item) => item.id === document.value?.documentType,
		);
		return type?.approvalChain ?? [];
	});

	const destinationItems = computed(() =>
		(destinationsData.value?.items ?? [])
			.filter((item) => item.active)
			.map((item) => ({
				title: `${item.name} · ${item.libraryName}`,
				value: item.id,
				subtitle: item.siteUrl,
			})),
	);

	const selectedDestination = computed(() =>
		destinationsData.value?.items?.find(
			(item) => item.id === forms.publishForm.publishDestinationId,
		) ?? null,
	);

	const previewFileName = computed(() => {
		if (!document.value) {
			return '';
		}
		const revision
			= document.value.submittedContentRevision
				?? document.value.contentRevision
				?? 0;
		return buildRevisionPdfFileName(document.value.id, revision, document.value.title);
	});

	const activeStep = computed(
		() =>
			document.value?.approvalSteps.find(
				(step) => step.status === 'queued' || step.status === 'pending',
			) ?? null,
	);

	const publishedLibraryPath = computed(() => {
		const number = document.value?.documentNumber;
		if (!number || (document.value?.status !== 'published' && document.value?.status !== 'superseded')) {
			return null;
		}
		return { name: 'library-document' as const, params: { documentNumber: number } };
	});

	async function invalidateDocumentQueries(forDocumentId?: string): Promise<void> {
		const id = forDocumentId ?? documentId.value;
		await Promise.all([
			queryCache.invalidateQueries({
				key: getDocumentQueryKey({ path: { documentId: id } }),
			}),
			queryCache.invalidateQueries({ key: listDocumentsQueryKey() }),
		]);
	}

	return {
		queryCache,
		document,
		isPending,
		error,
		refetch,
		typesData,
		destinationsData,
		forms,
		documentType,
		approvalChainPreview,
		destinationItems,
		selectedDestination,
		previewFileName,
		activeStep,
		publishedLibraryPath,
		invalidateDocumentQueries,
	};
}

export type WorkspaceDocumentState = ReturnType<typeof useWorkspaceDocumentState>;
