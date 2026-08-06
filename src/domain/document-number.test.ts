import { describe, expect, it } from 'vitest';
import {
	allocateDocumentNumber,
	DEFAULT_NUMBER_PATTERN,
	formatDocumentNumber,
} from './document-number.ts';

describe('document-number', () => {
	it('formats the default pattern', () => {
		expect(
			formatDocumentNumber({
				prefix: 'pol',
				pattern: DEFAULT_NUMBER_PATTERN,
				year: 2026,
				sequence: 42,
			}),
		).toBe('POL-2026-00042');
	});

	it('allocates and bumps nextSequence', () => {
		const result = allocateDocumentNumber(
			{
				numberPrefix: 'SOP',
				numberPattern: DEFAULT_NUMBER_PATTERN,
				nextSequence: 7,
			},
			new Date('2026-06-01T00:00:00.000Z'),
		);
		expect(result.documentNumber).toBe('SOP-2026-00007');
		expect(result.nextSequence).toBe(8);
	});
});
