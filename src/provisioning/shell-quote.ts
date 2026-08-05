/**
 * POSIX-safe single-quote wrapping for generated shell scripts.
 */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

const SAFE_TOKEN = /^[A-Z0-9][\w.-]*$/i;

/**
 * Validates identifiers that must stay unquoted tokens in CLI flags (connector ids, table names).
 */
export function assertSafeCliToken(value: string, field: string): string {
	const trimmed = value.trim();
	if (!SAFE_TOKEN.test(trimmed)) {
		throw new Error(
			`${field} must match ${SAFE_TOKEN} (got ${JSON.stringify(value)})`,
		);
	}
	return trimmed;
}
