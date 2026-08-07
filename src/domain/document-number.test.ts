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

	it('supports bare {seq} with default width 5', () => {
		expect(
			formatDocumentNumber({
				prefix: 'SOP',
				pattern: '{prefix}-{yyyy}-{seq}',
				year: 2026,
				sequence: 7,
			}),
		).toBe('SOP-2026-00007');
	});

	it('falls back to the default pattern when seq token is malformed', () => {
		expect(
			formatDocumentNumber({
				prefix: 'POL',
				pattern: '{prefix}-{yyyy}-{seq:abc}',
				year: 2026,
				sequence: 3,
			}),
		).toBe('POL-2026-00003');
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
		expect(result.sequenceYear).toBe(2026);
	});

	it('resets sequence when the calendar year advances', () => {
		const result = allocateDocumentNumber(
			{
				numberPrefix: 'POL',
				numberPattern: DEFAULT_NUMBER_PATTERN,
				nextSequence: 100,
				sequenceYear: 2026,
			},
			new Date('2027-01-02T00:00:00.000Z'),
		);
		expect(result.documentNumber).toBe('POL-2027-00001');
		expect(result.nextSequence).toBe(2);
		expect(result.sequenceYear).toBe(2027);
	});
});
