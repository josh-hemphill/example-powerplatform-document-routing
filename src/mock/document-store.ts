/**
 * In-memory document case store for the Vite mock (resettable in tests).
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { createSeedDocuments } from './seed-documents.ts';

const store = new Map<string, MockDocumentRecord>();

/**
 * Returns the mutable document map, seeding Contoso samples once.
 */
export function getDocumentStore(): Map<string, MockDocumentRecord> {
	if (store.size === 0) {
		for (const document of createSeedDocuments()) {
			store.set(document.id, document);
		}
	}
	return store;
}

/**
 * Clears and reseeds documents (tests).
 */
export function resetDocumentStore(): void {
	store.clear();
	for (const document of createSeedDocuments()) {
		store.set(document.id, document);
	}
}

/**
 * Empties the store without reseeding (isolated e2e scenarios).
 */
export function clearDocumentStore(): void {
	store.clear();
}
