/**
 * Adopter-facing app configuration.
 * Change this file (and `document-types.ts`) for most tenant-specific behavior.
 * Prefer env overrides / deploy/connections.json for hosts so custom domains stay out of source.
 *
 * Dev-only identity (`localDemoUser`, `VITE_LOCAL_DEMO_*`) never applies in hosted production —
 * see `allowsDemoIdentityFallback()` in the identity store.
 */
import type { LocalDemoUser } from './local-demo-user.ts';
import { localDemoUser } from './local-demo-user.ts';
import { bundledDocumentTypesHaveSampleIdentities } from './sample-identities.ts';

export type { LocalDemoUser } from './local-demo-user.ts';
export { parseLocalDemoRoles } from './local-demo-user.ts';

export interface SharePointDefaults {
	siteUrl: string;
	libraryName: string;
	/** Default folder under the library (leading slash). */
	folderPath: string;
}

export interface AppBrand {
	name: string;
	tagline: string;
}

export interface AppConfig {
	brand: AppBrand;
	/**
	 * Replace these with your tenant SharePoint defaults (any HTTPS host; vanity domains OK).
	 * Document types can override folderPath per type.
	 * Override at runtime with VITE_SHAREPOINT_* env vars.
	 */
	sharePoint: SharePointDefaults;
	/** Optional Dataverse org URL for docs / future adapters (custom domains OK). */
	dataverseEnvironmentUrl?: string;
	/** Used only when Power Apps host context is unavailable (local Vite DEV). */
	localDemoUser: LocalDemoUser;
	features: {
		/** Show the in-app setup banner until placeholders are replaced. */
		showSetupBanner: boolean;
		/** Allow editing the default approval chain before submit. */
		allowApproverOverride: boolean;
	};
}

/**
 * Vite only inlines `import.meta.env.VITE_*` on static property access.
 */
function nonEmptyEnv(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export const appConfig: AppConfig = {
	brand: {
		name: 'Document Routing',
		tagline: 'Freeform request → draft → approvals → SharePoint PDF',
	},
	sharePoint: {
		// Sample only — replace via .env (VITE_SHAREPOINT_SITE_URL) or edit here.
		// Any HTTPS host is valid; do not assume *.sharepoint.com.
		siteUrl:
			nonEmptyEnv(import.meta.env?.VITE_SHAREPOINT_SITE_URL)
			?? 'https://docs.example.com/sites/Policies',
		libraryName:
			nonEmptyEnv(import.meta.env?.VITE_SHAREPOINT_LIBRARY_NAME) ?? 'Published Documents',
		folderPath: nonEmptyEnv(import.meta.env?.VITE_SHAREPOINT_FOLDER_PATH) ?? '/Policies',
	},
	dataverseEnvironmentUrl: nonEmptyEnv(import.meta.env?.VITE_DATAVERSE_ENVIRONMENT_URL),
	localDemoUser,
	features: {
		showSetupBanner: true,
		/**
		 * Seed default only — runtime mock/hosted value lives in control `appsetting`
		 * / Admin Settings (`allowApproverOverride`, default off).
		 */
		allowApproverOverride: false,
	},
};

/**
 * True when SharePoint / demo identity still look like sample placeholders,
 * or when bundled document-type seeds still use Contoso/example approvers.
 * Does not require Microsoft primary domains — only checks for template markers.
 */
export function hasPlaceholderSharePointConfig(
	config: AppConfig = appConfig,
): boolean {
	const values = [
		config.sharePoint.siteUrl,
		config.localDemoUser.email,
		config.dataverseEnvironmentUrl ?? '',
	].map((value) => value.toLowerCase());

	const hasHostPlaceholder = values.some((value) => {
		if (!value) {
			return false;
		}
		if (
			value.includes('example.com')
			|| value.includes('example.org')
			|| value.includes('replace_me')
			|| value.includes('replace-me')
		) {
			return true;
		}
		return (
			value.includes('@contoso.com')
			|| value.includes('://contoso.')
			|| value.includes('.contoso.com')
		);
	});

	if (hasHostPlaceholder) {
		return true;
	}

	return bundledDocumentTypesHaveSampleIdentities();
}
