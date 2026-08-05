/**
 * URL helpers for deployer connections — host-agnostic (no Microsoft domain allowlists).
 */

const PLACEHOLDER_HOST_MARKERS = [
	'example.com',
	'example.org',
	'example.net',
	'localhost',
	'invalid',
] as const;

const PLACEHOLDER_TEXT_MARKERS = [
	'replace_me',
	'replace-me',
	'your-org',
	'your_tenant',
	'your-tenant',
] as const;

export interface ParsedEndpointUrl {
	href: string;
	origin: string;
	host: string;
	protocol: string;
}

/**
 * Parses an absolute HTTP(S) URL and rejects non-http(s) schemes.
 */
export function parseEndpointUrl(raw: string, fieldName: string): ParsedEndpointUrl {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} is required`);
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	}
	catch {
		throw new Error(`${fieldName} must be an absolute URL (got "${raw}")`);
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error(`${fieldName} must use http or https (got ${url.protocol})`);
	}

	return {
		href: url.href.replace(/\/+$/, ''),
		origin: url.origin,
		host: url.host.toLowerCase(),
		protocol: url.protocol,
	};
}

/**
 * True when the value still looks like sample / template placeholder text.
 */
export function looksLikePlaceholder(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return true;
	}
	if (PLACEHOLDER_TEXT_MARKERS.some((marker) => normalized.includes(marker))) {
		return true;
	}
	// Sample Contoso demo tokens only — not every hostname that happens to contain "contoso".
	if (
		normalized.includes('@contoso.com')
		|| normalized.includes('://contoso.')
		|| normalized.includes('.contoso.com')
		|| normalized === 'contoso.com'
	) {
		return true;
	}
	return false;
}

/**
 * True when a URL host is still a documentation sample (example.com, etc.).
 */
export function isPlaceholderHost(host: string): boolean {
	const normalized = host.toLowerCase();
	return PLACEHOLDER_HOST_MARKERS.some(
		(marker) =>
			normalized === marker
			|| normalized.endsWith(`.${marker}`)
			|| normalized.includes(`.${marker}:`),
	);
}

/**
 * Validates a connection endpoint without requiring Microsoft primary domains.
 * Deployable endpoints must be HTTPS (except relative API paths like `/api`).
 */
export function assertDeployableEndpoint(
	raw: string,
	fieldName: string,
	options: { allowRelativeApiPath?: boolean } = {},
): ParsedEndpointUrl | { href: string; relative: true } {
	const trimmed = raw.trim();
	if (options.allowRelativeApiPath && trimmed.startsWith('/')) {
		return { href: trimmed, relative: true };
	}

	const parsed = parseEndpointUrl(trimmed, fieldName);
	if (parsed.protocol !== 'https:') {
		throw new Error(
			`${fieldName} must use https for deploy/apply (got ${parsed.protocol}). Refusing plaintext hosts so tokens are not sent over http.`,
		);
	}
	if (looksLikePlaceholder(parsed.href) || isPlaceholderHost(parsed.host)) {
		throw new Error(
			`${fieldName} still uses a placeholder host ("${parsed.host}"). Set your real tenant/custom domain in deploy/connections.json.`,
		);
	}
	return parsed;
}

/**
 * Builds the Dataverse Web API root for any org URL (custom domains included).
 * Uses the URL origin only — path segments on environmentUrl are ignored/rejected.
 */
export function dataverseWebApiRoot(
	environmentUrl: string,
	apiVersion = 'v9.2',
): string {
	const parsed = parseEndpointUrl(environmentUrl, 'dataverse.environmentUrl');
	const url = new URL(environmentUrl.trim());
	const pathname = url.pathname.replace(/\/+$/, '');
	if (pathname && pathname !== '') {
		throw new Error(
			`dataverse.environmentUrl must be an org root URL without a path (got "${pathname}"). Use https://host.example only.`,
		);
	}
	const version = apiVersion.replace(/^\/+/, '');
	return `${parsed.origin}/api/data/${version}`;
}
