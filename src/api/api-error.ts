/**
 * Extracts a user-facing message from HeyAPI / Dataverse / mock error throws.
 * The generated fetch client often throws parsed JSON bodies, not `Error` instances.
 */

export interface ApiErrorBody {
	message?: unknown;
	code?: unknown;
	title?: unknown;
	error?: unknown;
	status?: unknown;
	statusText?: unknown;
}

const FALLBACK = 'Request failed';

/**
 * True when value looks like an API error payload with a message/code.
 */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
	return typeof value === 'object' && value !== null;
}

/**
 * Returns a stable display string for thrown API / network failures.
 */
export function getApiErrorMessage(error: unknown, fallback: string = FALLBACK): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	if (typeof error === 'string' && error.trim()) {
		return error;
	}
	if (!isApiErrorBody(error)) {
		return fallback;
	}

	const message = pickString(error.message) ?? pickString(error.title) ?? pickNestedMessage(error.error);
	const code = pickString(error.code);
	if (message && code) {
		return `${message} (${code})`;
	}
	if (message) {
		return message;
	}
	if (code) {
		return code;
	}

	const status = typeof error.status === 'number' ? error.status : null;
	const statusText = pickString(error.statusText);
	if (status != null && statusText) {
		return `${status} ${statusText}`;
	}
	if (status != null) {
		return `Request failed (${status})`;
	}
	return fallback;
}

/**
 * Returns the API error code when present.
 */
export function getApiErrorCode(error: unknown): string | null {
	if (!isApiErrorBody(error)) {
		return null;
	}
	return pickString(error.code);
}

function pickString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function pickNestedMessage(value: unknown): string | null {
	if (typeof value === 'string') {
		return pickString(value);
	}
	if (isApiErrorBody(value)) {
		return pickString(value.message) ?? pickString(value.title);
	}
	return null;
}
