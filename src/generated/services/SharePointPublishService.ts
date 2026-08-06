/**
 * Placeholder for the typed SharePoint service shape produced by:
 * `pnpm exec pa app add data-source --connector shared_sharepointonline ...`
 *
 * Phase 5: the Code App must **not** upload PDF/HTML bytes through this stub.
 * Trusted publish runs in Power Automate / the mock API under a service identity.
 * DEV may record publish intent only (no content).
 */
export interface SharePointPublishIntent {
	siteUrl: string;
	libraryName: string;
	folderPath: string;
	fileName: string;
}

export interface SharePointPublishIntentResult {
	recorded: true;
	at: string;
}

export const SharePointPublishService = {
	/**
	 * DEV-only intent log. Production publish goes through Flow — never call this
	 * with browser-generated "PDF" bytes.
	 */
	async recordPublishIntent(
		intent: SharePointPublishIntent,
	): Promise<SharePointPublishIntentResult> {
		if (import.meta.env.DEV) {
			console.warn('[SharePointPublishService] publish intent (no upload)', intent);
			return { recorded: true, at: new Date().toISOString() };
		}

		throw new Error(
			'Browser SharePoint uploads are disabled. Use POST /documents/{id}/publish so a Cloud Flow publishes under a service identity.',
		);
	},
};
