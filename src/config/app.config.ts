/**
 * Adopter-facing app configuration.
 * Change this file (and `document-types.ts`) for most tenant-specific behavior.
 */
export interface SharePointDefaults {
  siteUrl: string
  libraryName: string
  /** Default folder under the library (leading slash). */
  folderPath: string
}

export interface AppBrand {
  name: string
  tagline: string
}

export interface LocalDemoUser {
  userName: string
  email: string
}

export interface AppConfig {
  brand: AppBrand
  /**
   * Replace these with your tenant SharePoint defaults.
   * Document types can override folderPath per type.
   */
  sharePoint: SharePointDefaults
  /** Used only when Power Apps host context is unavailable (local Vite). */
  localDemoUser: LocalDemoUser
  features: {
    /** Show the in-app setup banner until placeholders are replaced. */
    showSetupBanner: boolean
    /** Allow editing the default approval chain before submit. */
    allowApproverOverride: boolean
  }
}

export const appConfig: AppConfig = {
  brand: {
    name: 'Document Routing',
    tagline: 'Freeform request → draft → approvals → SharePoint PDF',
  },
  sharePoint: {
    // TODO: replace with your SharePoint site URL
    siteUrl: 'https://contoso.sharepoint.com/sites/Policies',
    libraryName: 'Published Documents',
    folderPath: '/Policies',
  },
  localDemoUser: {
    userName: 'Local Developer',
    email: 'developer@contoso.com',
  },
  features: {
    showSetupBanner: true,
    allowApproverOverride: true,
  },
}

/**
 * True when SharePoint defaults still look like the sample Contoso placeholders.
 */
export function hasPlaceholderSharePointConfig(
  config: AppConfig = appConfig,
): boolean {
  return (
    config.sharePoint.siteUrl.includes('contoso.sharepoint.com') ||
    config.localDemoUser.email.endsWith('@contoso.com')
  )
}
