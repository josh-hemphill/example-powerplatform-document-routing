import type { Document } from '@/client/types.gen';
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useDocumentFormState } from '@/composables/use-document-form-state';
import { getDocumentType } from '@/config/document-types';

function makeDocument(overrides: Partial<Document> = {}): Document {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		title: 'Server title',
		documentType: 'policy',
		status: 'drafting',
		requesterEmail: 'requester@example.com',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		freeformRequest: 'Please draft a policy document for the team.',
		draftBodyMarkdown: '# Server draft',
		draftSummary: 'Server summary',
		contentRevision: 1,
		approvalSteps: [],
		reviewComments: [],
		history: [],
		...overrides,
	};
}

describe('useDocumentFormState', () => {
	it('hydrates once and does not clobber dirty draft edits on refetch', () => {
		const document = ref<Document | undefined>(makeDocument());
		const documentId = ref(document.value!.id);
		const types = ref(undefined);
		const activeDestinationIds = ref<string[]>([]);

		const state = useDocumentFormState({
			document,
			documentId,
			types,
			activeDestinationIds,
			fallbackType: getDocumentType,
		});

		expect(state.draftForm.title).toBe('Server title');
		state.draftForm.title = 'Local edit';
		expect(state.isDraftDirty.value).toBe(true);

		document.value = makeDocument({ title: 'Refetched title', draftBodyMarkdown: '# Refetch' });
		expect(state.draftForm.title).toBe('Local edit');
		expect(state.draftForm.bodyMarkdown).toBe('# Server draft');
	});

	it('re-hydrates when switching documents', async() => {
		const first = makeDocument();
		const second = makeDocument({
			id: '22222222-2222-4222-8222-222222222222',
			title: 'Second doc',
			draftBodyMarkdown: '# Second',
		});
		const document = ref<Document | undefined>(first);
		const documentId = ref(first.id);
		const state = useDocumentFormState({
			document,
			documentId,
			types: ref(undefined),
			activeDestinationIds: ref([]),
			fallbackType: getDocumentType,
		});

		state.draftForm.title = 'Dirty on first';
		document.value = second;
		documentId.value = second.id;
		await nextTick();
		expect(state.draftForm.title).toBe('Second doc');
		expect(state.isDirty.value).toBe(false);
	});

	it('markDraftClean clears dirty after save', () => {
		const document = ref<Document | undefined>(makeDocument());
		const state = useDocumentFormState({
			document,
			documentId: ref(document.value!.id),
			types: ref(undefined),
			activeDestinationIds: ref([]),
			fallbackType: getDocumentType,
		});
		state.draftForm.summary = 'Edited summary';
		expect(state.isDraftDirty.value).toBe(true);
		state.markDraftClean();
		expect(state.isDraftDirty.value).toBe(false);
	});

	it('preserves approval comments across soft refetch of the same document', async() => {
		const document = ref<Document | undefined>(makeDocument());
		const state = useDocumentFormState({
			document,
			documentId: ref(document.value!.id),
			types: ref(undefined),
			activeDestinationIds: ref([]),
			fallbackType: getDocumentType,
		});
		state.approvalForm.comment = 'Please review';
		document.value = makeDocument({ title: 'Refetched title' });
		await nextTick();
		expect(state.approvalForm.comment).toBe('Please review');
		expect(state.draftForm.title).toBe('Refetched title');
	});

	it('preserves in-progress review response drafts across soft refetch', async() => {
		const document = ref<Document | undefined>(makeDocument());
		const state = useDocumentFormState({
			document,
			documentId: ref(document.value!.id),
			types: ref(undefined),
			activeDestinationIds: ref([]),
			fallbackType: getDocumentType,
		});
		state.reviewResponseDrafts['comment-1'] = 'Added manager attestation language here.';
		document.value = makeDocument({ title: 'Refetched title' });
		await nextTick();
		expect(state.reviewResponseDrafts['comment-1']).toBe(
			'Added manager attestation language here.',
		);
		state.hydrateFromDocument(true);
		expect(state.reviewResponseDrafts['comment-1']).toBeUndefined();
	});
});
