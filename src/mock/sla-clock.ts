import { parseInstant } from '../domain/approval-queue.ts';

function allowsDevClockOverride(): boolean {
	try {
		const meta = import.meta as ImportMeta & {
			env?: { DEV?: boolean };
		};
		return Boolean(meta.env?.DEV);
	}
	catch {
		return false;
	}
}

/**
 * Resolves the SLA clock; `now` is accepted only in DEV and must be a valid instant.
 */
export function resolveSlaClock(now?: string): Date {
	if (now === undefined || now === '') {
		return new Date();
	}
	if (!allowsDevClockOverride()) {
		return new Date();
	}
	const parsed = parseInstant(now);
	if (!parsed) {
		throw Object.assign(new Error('Invalid now timestamp'), {
			code: 'validation_error',
		});
	}
	return parsed;
}
