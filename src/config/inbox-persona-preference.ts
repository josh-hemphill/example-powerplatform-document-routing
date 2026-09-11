import type { InboxPersona } from './inbox-personas.ts';
import { INBOX_PERSONAS } from './inbox-personas.ts';

export const INBOX_PERSONA_STORAGE_KEY = 'document-routing.inbox-persona';

export interface InboxPersonaPreference {
	email: string;
	persona: InboxPersona;
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * True when `value` is a known inbox persona chip.
 */
export function isInboxPersona(value: unknown): value is InboxPersona {
	return typeof value === 'string'
		&& INBOX_PERSONAS.some((item) => item.value === value);
}

/**
 * Reads the session inbox-persona preference, or null when missing/invalid.
 */
export function readInboxPersonaPreference(
	storage: PreferenceStorage | null = sessionStorageOrNull(),
): InboxPersonaPreference | null {
	if (!storage) {
		return null;
	}
	try {
		const raw = storage.getItem(INBOX_PERSONA_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<InboxPersonaPreference>;
		if (typeof parsed.email !== 'string' || !isInboxPersona(parsed.persona)) {
			return null;
		}
		return { email: parsed.email, persona: parsed.persona };
	}
	catch {
		return null;
	}
}

/**
 * Persists the inbox persona chip for the current actor.
 */
export function writeInboxPersonaPreference(
	email: string,
	persona: InboxPersona,
	storage: PreferenceStorage | null = sessionStorageOrNull(),
): void {
	const trimmed = email.trim();
	if (!storage || !trimmed) {
		return;
	}
	try {
		storage.setItem(
			INBOX_PERSONA_STORAGE_KEY,
			JSON.stringify({ email: trimmed, persona }),
		);
	}
	catch {
		// Ignore quota / private-mode failures.
	}
}

/**
 * Returns the stored chip when it belongs to `actorEmail`.
 */
export function resolveStoredInboxPersona(
	actorEmail: string | undefined,
	stored: InboxPersonaPreference | null,
): InboxPersona | null {
	const email = actorEmail?.trim().toLowerCase();
	if (!email || !stored) {
		return null;
	}
	if (stored.email.trim().toLowerCase() !== email) {
		return null;
	}
	return stored.persona;
}

/**
 * Actor key so inbox queries refetch when Acting as changes.
 */
export function inboxDocumentsQueryActorKey(actorEmail: string | undefined): string {
	return actorEmail?.trim().toLowerCase() || 'anonymous';
}

function sessionStorageOrNull(): PreferenceStorage | null {
	try {
		return globalThis.sessionStorage;
	}
	catch {
		return null;
	}
}
