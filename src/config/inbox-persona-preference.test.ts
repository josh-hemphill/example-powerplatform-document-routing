import { describe, expect, it } from 'vitest';
import {
	inboxDocumentsQueryActorKey,
	INBOX_PERSONA_STORAGE_KEY,
	isInboxPersona,
	readInboxPersonaPreference,
	resolveStoredInboxPersona,
	writeInboxPersonaPreference,
} from './inbox-persona-preference.ts';

function memoryStorage(initial: Record<string, string> = {}): Storage {
	const data = { ...initial };
	return {
		get length() {
			return Object.keys(data).length;
		},
		clear() {
			for (const key of Object.keys(data)) {
				delete data[key];
			}
		},
		getItem(key: string) {
			return Object.hasOwn(data, key) ? data[key] : null;
		},
		key(index: number) {
			return Object.keys(data)[index] ?? null;
		},
		removeItem(key: string) {
			delete data[key];
		},
		setItem(key: string, value: string) {
			data[key] = value;
		},
	};
}

describe('inbox persona preference', () => {
	it('round-trips a stored chip for the same actor', () => {
		const storage = memoryStorage();
		writeInboxPersonaPreference('Me@Example.com', 'all', storage);
		expect(storage.getItem(INBOX_PERSONA_STORAGE_KEY)).toContain('"all"');
		expect(readInboxPersonaPreference(storage)).toEqual({
			email: 'Me@Example.com',
			persona: 'all',
		});
		expect(
			resolveStoredInboxPersona('me@example.com', readInboxPersonaPreference(storage)),
		).toBe('all');
	});

	it('ignores a chip stored for a different actor', () => {
		expect(
			resolveStoredInboxPersona('jordan.legal@contoso.com', {
				email: 'me@example.com',
				persona: 'waiting_on_me',
			}),
		).toBeNull();
	});

	it('rejects invalid stored payloads', () => {
		expect(isInboxPersona('waiting_on_me')).toBe(true);
		expect(isInboxPersona('not-a-persona')).toBe(false);
		expect(
			readInboxPersonaPreference(
				memoryStorage({ [INBOX_PERSONA_STORAGE_KEY]: '{"email":"a@b.c","persona":"nope"}' }),
			),
		).toBeNull();
		expect(
			readInboxPersonaPreference(
				memoryStorage({ [INBOX_PERSONA_STORAGE_KEY]: 'not-json' }),
			),
		).toBeNull();
	});

	it('uses a stable lowercase actor key for inbox query cache', () => {
		expect(inboxDocumentsQueryActorKey('Pat@Contoso.com')).toBe('pat@contoso.com');
		expect(inboxDocumentsQueryActorKey(undefined)).toBe('anonymous');
	});
});
