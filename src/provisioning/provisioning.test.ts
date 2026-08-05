import { describe, expect, it } from 'vitest'
import {
  assertDeployableEndpoint,
  dataverseWebApiRoot,
  isPlaceholderHost,
  looksLikePlaceholder,
  parseEndpointUrl,
} from './connection-urls.ts'
import { validateConnectionProfile, type ConnectionProfile } from './connection-config.ts'
import { buildDataverseProvisionPlan } from './dataverse-provision-plan.ts'
import { buildPaConnectCommands } from './pa-connect-commands.ts'
import { buildDataverseSchema, prefixedLogicalName } from './dataverse-schema.ts'
import { applyDataversePlan } from './write-artifacts.ts'

const sampleProfile = (): ConnectionProfile => ({
  publisher: {
    uniqueName: 'docrouting',
    friendlyName: 'Document Routing',
    prefix: 'dr',
    optionValuePrefix: 72700,
  },
  solution: {
    uniqueName: 'DocumentRouting',
    friendlyName: 'Document Routing',
    version: '1.0.0.0',
  },
  powerPlatform: {
    environmentId: '11111111-2222-3333-4444-555555555555',
    cloud: 'public',
  },
  dataverse: {
    environmentUrl: 'https://data.fabrikam.internal',
    apiVersion: 'v9.2',
  },
  sharePoint: {
    siteUrl: 'https://docs.fabrikam.internal/sites/Policies',
    libraryName: 'Published Documents',
    folderPath: '/Policies',
    connectorId: 'shared_sharepointonline',
  },
  api: {
    baseUrl: 'https://api.fabrikam.internal/document-routing',
  },
})

describe('connection URLs', () => {
  it('accepts custom / vanity hosts (not only Microsoft primary domains)', () => {
    expect(parseEndpointUrl('https://docs.fabrikam.internal/sites/X', 'site').host).toBe(
      'docs.fabrikam.internal',
    )
    expect(
      parseEndpointUrl('https://dataverse.contoso-corp.net', 'org').host,
    ).toBe('dataverse.contoso-corp.net')
    expect(dataverseWebApiRoot('https://org.crm.dynamics.com/')).toBe(
      'https://org.crm.dynamics.com/api/data/v9.2',
    )
    expect(dataverseWebApiRoot('https://data.fabrikam.internal')).toBe(
      'https://data.fabrikam.internal/api/data/v9.2',
    )
  })

  it('builds Web API root from origin and rejects org URLs with a path', () => {
    expect(() =>
      dataverseWebApiRoot('https://data.fabrikam.internal/foo'),
    ).toThrow(/without a path/)
  })

  it('requires https for deployable endpoints', () => {
    expect(() =>
      assertDeployableEndpoint('http://docs.fabrikam.internal/sites/X', 'sharePoint.siteUrl'),
    ).toThrow(/must use https/)
  })

  it('flags documentation placeholders without requiring *.sharepoint.com', () => {
    expect(isPlaceholderHost('docs.example.com')).toBe(true)
    expect(isPlaceholderHost('docs.fabrikam.internal')).toBe(false)
    expect(looksLikePlaceholder('https://REPLACE_ME.dataverse.example.com')).toBe(
      true,
    )
    expect(() =>
      assertDeployableEndpoint(
        'https://docs.example.com/sites/Policies',
        'sharePoint.siteUrl',
      ),
    ).toThrow(/placeholder host/)
  })
})

describe('connection profile validation', () => {
  it('allows custom domains when strict', () => {
    const issues = validateConnectionProfile(sampleProfile(), {
      requireDeployableHosts: true,
    })
    expect(issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
  })

  it('errors on example placeholder hosts when strict', () => {
    const profile = sampleProfile()
    profile.sharePoint.siteUrl = 'https://docs.example.com/sites/Policies'
    const issues = validateConnectionProfile(profile, {
      requireDeployableHosts: true,
    })
    expect(issues.some((issue) => issue.field === 'sharePoint.siteUrl')).toBe(true)
  })
})

describe('dataverse schema + provision plan', () => {
  it('prefixes tables and includes queue/SLA fields', () => {
    const schema = buildDataverseSchema('dr')
    expect(prefixedLogicalName('dr', 'document')).toBe('dr_document')
    expect(schema.tables.map((table) => table.schemaName)).toEqual([
      'document',
      'approvalstep',
      'historyevent',
    ])
    const document = schema.tables[0]!
    expect(document.columns.some((column) => column.schemaName === 'currentpoolemails')).toBe(
      true,
    )
    const step = schema.tables[1]!
    expect(step.columns.some((column) => column.schemaName === 'elevationpooljson')).toBe(
      true,
    )
  })

  it('uses publisher optionValuePrefix for choice option values', () => {
    const schema = buildDataverseSchema('dr', 81_200)
    const status = schema.tables[0]!.columns.find((column) => column.schemaName === 'status')
    expect(status?.options?.[0]).toEqual({ value: 812_000_000, label: 'requested' })
    expect(status?.options?.[2]).toEqual({ value: 812_000_002, label: 'in_review' })
  })

  it('builds web api plan and pa commands using profile hosts', () => {
    const profile = sampleProfile()
    const plan = buildDataverseProvisionPlan(profile)
    expect(plan.apiRoot).toBe('https://data.fabrikam.internal/api/data/v9.2')
    expect(plan.tableLogicalNames).toContain('dr_document')
    expect(plan.requests.some((request) => request.path === '/EntityDefinitions')).toBe(
      true,
    )
    expect(plan.environmentVariableDefaults.dr_SharePointSiteUrl).toBe(
      profile.sharePoint.siteUrl,
    )

    const commands = buildPaConnectCommands(profile, plan)
    const sharePoint = commands.find((item) =>
      item.command.includes('--dataset '),
    )
    expect(sharePoint?.command).toContain(
      '--dataset "https://docs.fabrikam.internal/sites/Policies"',
    )
    expect(sharePoint?.command).not.toContain('sharepoint.com')

    const dataverse = commands.find((item) => item.command.includes('--table dr_document'))
    expect(dataverse?.command).toContain(
      '--org-url "https://data.fabrikam.internal"',
    )
  })
})

describe('applyDataversePlan', () => {
  it('does not treat HTTP 404 as skipped when creating entities', async () => {
    const profile = sampleProfile()
    const plan = buildDataverseProvisionPlan(profile)
    const createOnly = {
      ...plan,
      requests: plan.requests.filter((request) => request.path === '/EntityDefinitions').slice(0, 1),
    }

    const result = await applyDataversePlan(
      createOnly,
      'token',
      async () =>
        new Response('{"error":{"message":"Not Found"}}', {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.error).toMatch(/HTTP 404/)
  })
})
