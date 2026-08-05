/**
 * Detects documentation / Contoso sample identities in local seed config.
 */
import { documentTypes } from './document-types.ts';

/**
 * True when an email still looks like documentation sample data.
 */
export function isSampleControlEmail(email: string): boolean {
	const value = email.trim().toLowerCase();
	return (
		value.includes('example.com')
		|| value.includes('example.org')
		|| value.includes('replace_me')
		|| value.includes('replace-me')
		|| value.endsWith('@contoso.com')
		|| value.includes('@contoso.')
	);
}

/**
 * Collects sample approver emails still present in bundled document-types seed.
 */
export function bundledDocumentTypesHaveSampleIdentities(): boolean {
	for (const type of documentTypes) {
		for (const step of type.approvalChain) {
			if (step.mode === 'named' && isSampleControlEmail(step.email)) {
				return true;
			}
			if (step.mode === 'pool') {
				if (step.pool.some((member) => isSampleControlEmail(member.email))) {
					return true;
				}
			}
			if (step.elevationPool?.some((member) => isSampleControlEmail(member.email))) {
				return true;
			}
		}
	}
	return false;
}
