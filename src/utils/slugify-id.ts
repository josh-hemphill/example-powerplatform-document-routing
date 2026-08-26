/**
 * Build a stable slug id from a human label (document types, pool keys).
 */
export function slugifyId(value: string, fallback = 'item'): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || fallback;
}

/**
 * Ensure a candidate id is unique among existing ids (ids/labels are slug-normalized).
 */
export function uniqueSlugId(
	label: string,
	existingIds: Iterable<string>,
	fallback = 'item',
): string {
	const taken = new Set(
		[...existingIds].map((id) => slugifyId(id, fallback)),
	);
	const base = slugifyId(label, fallback);
	if (!taken.has(base)) {
		return base;
	}
	let index = 2;
	while (taken.has(`${base}-${index}`)) {
		index += 1;
	}
	return `${base}-${index}`;
}

/**
 * Human label whose slug is unique among existing keys/labels (e.g. pool names).
 */
export function uniqueLabel(
	baseLabel: string,
	existingKeys: Iterable<string>,
	fallback = 'item',
): string {
	const slug = uniqueSlugId(baseLabel, existingKeys, fallback);
	const base = slugifyId(baseLabel, fallback);
	if (slug === base) {
		return baseLabel;
	}
	const suffix = slug.slice(base.length + 1);
	return `${baseLabel} ${suffix}`;
}

/**
 * Short uppercase document-number prefix unique among existing prefixes.
 */
export function uniqueNumberPrefix(
	seed: string,
	existingPrefixes: Iterable<string>,
	fallback = 'TYP',
): string {
	const taken = new Set(
		[...existingPrefixes]
			.map((prefix) => prefix.trim().toUpperCase())
			.filter(Boolean),
	);
	const compact = seed.replace(/[^a-z0-9]/gi, '').toUpperCase();
	const base = (compact.slice(0, 3) || fallback).toUpperCase();
	if (!taken.has(base)) {
		return base;
	}
	let index = 2;
	while (taken.has(`${base}${index}`)) {
		index += 1;
	}
	return `${base}${index}`;
}
