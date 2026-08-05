import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertDeployableEndpoint,
  looksLikePlaceholder,
  parseEndpointUrl,
} from './connection-urls.ts'

export interface PublisherConfig {
  uniqueName: string
  friendlyName: string
  prefix: string
  optionValuePrefix?: number
}

export interface SolutionConfig {
  uniqueName: string
  friendlyName: string
  version: string
}

export interface PowerPlatformConfig {
  environmentId: string
  cloud?: 'public' | 'usgov' | 'usgovhigh' | 'usgovdod' | 'china'
}

export interface DataverseConnectionConfig {
  environmentUrl: string
  apiVersion?: string
}

export interface SharePointConnectionConfig {
  siteUrl: string
  libraryName: string
  folderPath?: string
  connectorId?: string
}

export interface ApiConnectionConfig {
  baseUrl: string
}

export interface ConnectionProfile {
  publisher: PublisherConfig
  solution: SolutionConfig
  powerPlatform: PowerPlatformConfig
  dataverse: DataverseConnectionConfig
  sharePoint: SharePointConnectionConfig
  api: ApiConnectionConfig
  notes?: string[]
}

export interface ConnectionValidationIssue {
  field: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Loads a connection profile JSON file from disk.
 */
export function loadConnectionProfile(filePath: string): ConnectionProfile {
  const absolute = resolve(filePath)
  const raw = readFileSync(absolute, 'utf8')
  return JSON.parse(raw) as ConnectionProfile
}

/**
 * Soft-validates shape and warns/errors on placeholders without Microsoft domain checks.
 */
export function validateConnectionProfile(
  profile: ConnectionProfile,
  options: { requireDeployableHosts?: boolean } = {},
): ConnectionValidationIssue[] {
  const issues: ConnectionValidationIssue[] = []
  const requireHosts = options.requireDeployableHosts ?? false

  if (!/^[a-z]{2,8}$/.test(profile.publisher.prefix)) {
    issues.push({
      field: 'publisher.prefix',
      message: 'Publisher prefix must be 2–8 lowercase letters',
      severity: 'error',
    })
  }

  if (looksLikePlaceholder(profile.powerPlatform.environmentId)) {
    issues.push({
      field: 'powerPlatform.environmentId',
      message: 'Replace REPLACE_ME_ENVIRONMENT_ID with your environment GUID',
      severity: requireHosts ? 'error' : 'warning',
    })
  }

  const checkUrl = (field: string, value: string, allowRelative = false) => {
    try {
      if (requireHosts) {
        assertDeployableEndpoint(value, field, {
          allowRelativeApiPath: allowRelative,
        })
      } else {
        if (allowRelative && value.trim().startsWith('/')) {
          return
        }
        parseEndpointUrl(value, field)
        if (looksLikePlaceholder(value)) {
          issues.push({
            field,
            message: `Looks like a placeholder — replace with your real endpoint`,
            severity: 'warning',
          })
        }
      }
    } catch (error) {
      issues.push({
        field,
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      })
    }
  }

  checkUrl('dataverse.environmentUrl', profile.dataverse.environmentUrl)
  checkUrl('sharePoint.siteUrl', profile.sharePoint.siteUrl)
  checkUrl('api.baseUrl', profile.api.baseUrl, true)

  if (!profile.sharePoint.libraryName.trim()) {
    issues.push({
      field: 'sharePoint.libraryName',
      message: 'Library name is required',
      severity: 'error',
    })
  }

  return issues
}
