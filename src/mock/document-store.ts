/**
 * In-memory document case store for the Vite mock (resettable in tests).
 */
import type { MockDocumentRecord } from './seed-documents.ts';
import { createSeedDocuments } from './seed-documents.ts';

const store = new Map<string, MockDocumentRecord>();
/** When true, an empty store is intentional (cleared for tests) and must not auto-reseed. */
let initialized = false;

function seedIntoStore(): void {
	for (const document of createSeedDocuments()) {
		store.set(document.id, document);
	}
}

/**
 * Returns the mutable document map, seeding Contoso samples on first use.
 */
export function getDocumentStore(): Map<string, MockDocumentRecord> {
	if (!initialized) {
		seedIntoStore();
		initialized = true;
	}
	return store;
}

/**
 * Clears and reseeds documents (tests / plugin restart helpers).
 */
export function resetDocumentStore(): void {
	store.clear();
	seedIntoStore();
	initialized = true;
}

/**
 * Empties the store without reseeding (isolated e2e scenarios).
 * Subsequent `getDocumentStore()` calls stay empty until `resetDocumentStore()`.
 */
export function clearDocumentStore(): void {
	store.clear();
	initialized = true;
}
