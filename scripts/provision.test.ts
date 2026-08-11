import { describe, expect, it } from 'vitest';
import { parseProvisionArgs } from './provision.ts';

describe('parseProvisionArgs', () => {
	it('defaults to generate-only', () => {
		expect(parseProvisionArgs([])).toEqual({
			useExample: false,
			apply: false,
			solution: false,
			intoSolution: false,
			unmanagedOk: false,
			strict: false,
		});
	});

	it('parses dual-path flags', () => {
		expect(
			parseProvisionArgs([
				'--apply',
				'--into-solution',
				'--unmanaged-ok',
				'--solution',
				'--example',
				'--strict',
			]),
		).toEqual({
			useExample: true,
			apply: true,
			solution: true,
			intoSolution: true,
			unmanagedOk: true,
			strict: true,
		});
	});
});
