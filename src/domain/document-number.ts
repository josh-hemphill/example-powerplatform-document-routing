/**
 * Controlled document number formatting and allocation (server/mock only).
 */

export const DEFAULT_NUMBER_PATTERN = '{prefix}-{yyyy}-{seq:5}';

export interface NumberSequenceSource {
	numberPrefix: string;
	numberPattern: string;
	nextSequence: number;
	/** Year the current `nextSequence` applies to; resets sequence when the clock year advances. */
	sequenceYear?: number | null;
}

const SEQ_TOKEN = /\{seq(?::(\d+))?\}/;

/**
 * Formats a controlled document number from prefix, pattern, year, and sequence.
 * Supports `{seq}` and `{seq:N}`. Malformed `{seq…}` tokens fall back to the default pattern.
 */
export function formatDocumentNumber(options: {
	prefix: string;
	pattern?: string;
	year: number;
	sequence: number;
}): string {
	const prefix = options.prefix.trim().toUpperCase() || 'DOC';
	let pattern = options.pattern?.trim() || DEFAULT_NUMBER_PATTERN;
	if (!SEQ_TOKEN.test(pattern)) {
		pattern = DEFAULT_NUMBER_PATTERN;
	}
	const seqMatch = pattern.match(SEQ_TOKEN);
	const width = seqMatch?.[1] ? Number(seqMatch[1]) : 5;
	const seq = String(Math.max(0, Math.trunc(options.sequence))).padStart(width, '0');
	return pattern
		.replaceAll('{prefix}', prefix)
		.replaceAll('{yyyy}', String(options.year))
		.replaceAll(/\{seq(?::\d+)?\}/g, seq);
}

/**
 * Allocates the next number and returns the updated sequence counter + year.
 * Resets the sequence to 1 when the clock year differs from `sequenceYear`.
 * Does not mutate the input object.
 */
export function allocateDocumentNumber(
	source: NumberSequenceSource,
	clock: Date = new Date(),
): { documentNumber: string; nextSequence: number; sequenceYear: number } {
	const year = clock.getUTCFullYear();
	const priorYear = source.sequenceYear ?? year;
	const sequence
		= priorYear === year
			? Math.max(1, Math.trunc(source.nextSequence || 1))
			: 1;
	const documentNumber = formatDocumentNumber({
		prefix: source.numberPrefix,
		pattern: source.numberPattern,
		year,
		sequence,
	});
	return {
		documentNumber,
		nextSequence: sequence + 1,
		sequenceYear: year,
	};
}
