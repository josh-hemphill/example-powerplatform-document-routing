import type { Ref } from 'vue';
import type { ControlDocumentType, Document } from '@/client/types.gen';
import type { DocumentTypeDefinition } from '@/config/document-types';
import { computed, reactive, ref, watch } from 'vue';
import { buildDraftFromTemplate } from '@/config/document-types';

export interface DraftFormState {
	title: string;
	bodyMarkdown: string;
	summary: string;
}

export interface PublishFormState {
	publishDestinationId: string | null;
	folderPathOverride: string;
}

export interface ApprovalFormState {
	comment: string;
}

export interface DecisionFormState {
	comment: string;
}

interface FormSnapshot {
	draft: DraftFormState;
	publish: PublishFormState;
}

/**
 * Keeps editable workspace forms separate from the server document snapshot.
 * Hydrates on first load / document id change / explicit reset only — never on refetch while dirty.
 */
export function useDocumentFormState(input: {
	document: Ref<Document | undefined>;
	documentId: Ref<string>;
	types: Ref<ControlDocumentType[] | undefined>;
	activeDestinationIds: Ref<string[]>;
	fallbackType: (documentTypeId: string | undefined) => DocumentTypeDefinition;
}) {
	const draftForm = reactive<DraftFormState>({
		title: '',
		bodyMarkdown: '',
		summary: '',
	});
	const publishForm = reactive<PublishFormState>({
		publishDestinationId: null,
		folderPathOverride: '',
	});
	const approvalForm = reactive<ApprovalFormState>({ comment: '' });
	const decisionForm = reactive<DecisionFormState>({ comment: '' });

	const hydratedDocumentId = ref<string | null>(null);
	const snapshot = ref<FormSnapshot | null>(null);

	const isDraftDirty = computed(() => {
		if (!snapshot.value) {
			return false;
		}
		return (
			draftForm.title !== snapshot.value.draft.title
			|| draftForm.bodyMarkdown !== snapshot.value.draft.bodyMarkdown
			|| draftForm.summary !== snapshot.value.draft.summary
		);
	});

	const isPublishDirty = computed(() => {
		if (!snapshot.value) {
			return false;
		}
		return (
			publishForm.publishDestinationId !== snapshot.value.publish.publishDestinationId
			|| publishForm.folderPathOverride !== snapshot.value.publish.folderPathOverride
		);
	});

	const isDirty = computed(() => isDraftDirty.value || isPublishDirty.value);

	function buildDraftState(document: Document): DraftFormState {
		const fallback = input.fallbackType(document.documentType);
		const live = input.types.value?.find((item) => item.id === document.documentType);
		const body
			= document.draftBodyMarkdown
				?? buildDraftFromTemplate(
					live
						? {
								...fallback,
								draftTemplate: live.draftTemplate,
								label: live.label,
							}
						: fallback,
					document.title,
					document.freeformRequest,
				);
		return {
			title: document.title,
			bodyMarkdown: body,
			summary: document.draftSummary ?? '',
		};
	}

	function buildPublishState(document: Document): PublishFormState {
		const typeDefault = input.types.value?.find(
			(item) => item.id === document.documentType,
		)?.defaultDestinationId ?? null;
		const activeIds = input.activeDestinationIds.value;
		const activeDefault
			= typeDefault && activeIds.includes(typeDefault) ? typeDefault : null;
		return {
			publishDestinationId: activeDefault ?? activeIds[0] ?? null,
			folderPathOverride: '',
		};
	}

	function applySnapshot(next: FormSnapshot): void {
		draftForm.title = next.draft.title;
		draftForm.bodyMarkdown = next.draft.bodyMarkdown;
		draftForm.summary = next.draft.summary;
		publishForm.publishDestinationId = next.publish.publishDestinationId;
		publishForm.folderPathOverride = next.publish.folderPathOverride;
		snapshot.value = {
			draft: { ...next.draft },
			publish: { ...next.publish },
		};
	}

	/**
	 * Hydrates forms from the server document (load, document switch, or discard).
	 */
	function hydrateFromDocument(force = false): void {
		const document = input.document.value;
		if (!document) {
			return;
		}
		const sameDocument = hydratedDocumentId.value === document.id;
		if (sameDocument && !force && isDirty.value) {
			return;
		}
		const next = {
			draft: buildDraftState(document),
			publish: buildPublishState(document),
		};
		applySnapshot(next);
		hydratedDocumentId.value = document.id;
		approvalForm.comment = '';
		decisionForm.comment = '';
	}

	/**
	 * Marks the current form values as clean after a successful save.
	 */
	function markDraftClean(): void {
		if (!snapshot.value) {
			snapshot.value = {
				draft: { ...draftForm },
				publish: { ...publishForm },
			};
			return;
		}
		snapshot.value = {
			draft: { ...draftForm },
			publish: { ...snapshot.value.publish },
		};
	}

	/**
	 * Marks publish fields clean after a successful publish (or destination-only reset).
	 */
	function markPublishClean(): void {
		if (!snapshot.value) {
			snapshot.value = {
				draft: { ...draftForm },
				publish: { ...publishForm },
			};
			return;
		}
		snapshot.value = {
			draft: { ...snapshot.value.draft },
			publish: { ...publishForm },
		};
	}

	watch(
		[input.document, input.types, input.activeDestinationIds, input.documentId],
		() => {
			hydrateFromDocument(false);
		},
		{ immediate: true },
	);

	return {
		draftForm,
		publishForm,
		approvalForm,
		decisionForm,
		isDraftDirty,
		isPublishDirty,
		isDirty,
		hydrateFromDocument,
		markDraftClean,
		markPublishClean,
	};
}
