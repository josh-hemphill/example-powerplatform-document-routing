import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductionApiBaseUrl, getApiBaseUrl } from '@/api/base-url';

describe('getApiBaseUrl', () => {
	afterEach(() => {
		delete window.__DOCUMENT_ROUTING_ENV__;
		vi.unstubAllEnvs();
	});

	it('defaults to the local mock mount path', () => {
		expect(getApiBaseUrl()).toBe('/api');
	});

	it('prefers runtime injection over defaults', () => {
		window.__DOCUMENT_ROUTING_ENV__ = {
			documentApiBaseUrl: 'https://contoso.crm.dynamics.com/api/document-routing',
		};
		expect(getApiBaseUrl()).toBe('https://contoso.crm.dynamics.com/api/document-routing');
	});
});

describe('assertProductionApiBaseUrl', () => {
	it('allows /api outside production', () => {
		expect(() => assertProductionApiBaseUrl('/api', { isProduction: false })).not.toThrow();
	});

	it('throws when production still targets /api', () => {
		expect(() => assertProductionApiBaseUrl('/api', { isProduction: true })).toThrow(/local mock API/i);
	});

	it('allows a hosted API base in production', () => {
		expect(() =>
			assertProductionApiBaseUrl(
				'https://contoso.crm.dynamics.com/api/document-routing',
				{ isProduction: true },
			),
		).not.toThrow();
	});

	it('allows hosted roots whose path ends with /api', () => {
		expect(() =>
			assertProductionApiBaseUrl('https://example.com/api', { isProduction: true }),
		).not.toThrow();
	});
});
