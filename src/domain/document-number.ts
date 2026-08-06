/**
 * Controlled document number formatting and allocation (server/mock only).
 */

export const DEFAULT_NUMBER_PATTERN = '{prefix}-{yyyy}-{seq:5}';

export interface NumberSequenceSource {
	numberPrefix: string;
	numberPattern: string;
	nextSequence: number;
}

/**
 * Formats a controlled document number from prefix, pattern, year, and sequence.
 */
export function formatDocumentNumber(options: {
	prefix: string;
	pattern?: string;
	year: number;
	sequence: number;
}): string {
	const prefix = options.prefix.trim().toUpperCase() || 'DOC';
	const pattern = options.pattern?.trim() || DEFAULT_NUMBER_PATTERN;
	const seqMatch = pattern.match(/\{seq:(\d+)\}/);
	const width = seqMatch ? Number(seqMatch[1]) : 5;
	const seq = String(Math.max(0, Math.trunc(options.sequence))).padStart(width, '0');
	return pattern
		.replaceAll('{prefix}', prefix)
		.replaceAll('{yyyy}', String(options.year))
		.replaceAll(/\{seq:\d+\}/g, seq);
}

/**
 * Allocates the next number and returns the updated sequence counter.
 * Does not mutate the input object.
 */
export function allocateDocumentNumber(
	source: NumberSequenceSource,
	clock: Date = new Date(),
): { documentNumber: string; nextSequence: number } {
	const sequence = Math.max(1, Math.trunc(source.nextSequence || 1));
	const documentNumber = formatDocumentNumber({
		prefix: source.numberPrefix,
		pattern: source.numberPattern,
		year: clock.getUTCFullYear(),
		sequence,
	});
	return {
		documentNumber,
		nextSequence: sequence + 1,
	};
}
