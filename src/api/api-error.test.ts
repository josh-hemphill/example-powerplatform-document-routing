import { describe, expect, it } from 'vitest';
import { getApiErrorCode, getApiErrorMessage, isApiErrorBody } from '@/api/api-error';

describe('getApiErrorMessage', () => {
	it('reads Error.message', () => {
		expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
	});

	it('reads HeyAPI JSON error bodies', () => {
		expect(getApiErrorMessage({ message: 'Title too short', code: 'validation_error' })).toBe(
			'Title too short (validation_error)',
		);
	});

	it('falls back when the payload has no message', () => {
		expect(getApiErrorMessage({ status: 409 })).toBe('Request failed (409)');
		expect(getApiErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
	});

	it('exposes error codes', () => {
		expect(getApiErrorCode({ code: 'forbidden' })).toBe('forbidden');
		expect(getApiErrorCode(new Error('x'))).toBeNull();
		expect(isApiErrorBody({ message: 'x' })).toBe(true);
	});
});
