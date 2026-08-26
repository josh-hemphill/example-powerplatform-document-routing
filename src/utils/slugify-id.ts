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
 * Ensure a candidate id is unique among existing ids.
 */
export function uniqueSlugId(
	label: string,
	existingIds: Iterable<string>,
	fallback = 'item',
): string {
	const taken = new Set(
		[...existingIds].map((id) => id.trim().toLowerCase()),
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
 * Human label whose slug is unique among existing keys (e.g. approver pool names).
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
