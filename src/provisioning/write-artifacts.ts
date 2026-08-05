import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConnectionProfile } from './connection-config.ts'
import {
  buildDataverseProvisionPlan,
  type DataverseProvisionPlan,
  type WebApiRequestPlan,
} from './dataverse-provision-plan.ts'
import {
  buildPaConnectCommands,
  renderPaCommandsScript,
} from './pa-connect-commands.ts'
import { validateConnectionProfile } from './connection-config.ts'

export interface ProvisionArtifacts {
  plan: DataverseProvisionPlan
  outputDir: string
  files: string[]
  validationErrors: string[]
  validationWarnings: string[]
}

export interface ApplyResult {
  applied: number
  skipped: number
  failed: Array<{ description: string; error: string }>
}

/**
 * Writes provision plan JSON, env defaults, and pa connect script under deploy/generated.
 */
export function writeProvisionArtifacts(
  profile: ConnectionProfile,
  outputDir: string,
  options: { requireDeployableHosts?: boolean } = {},
): ProvisionArtifacts {
  const issues = validateConnectionProfile(profile, {
    requireDeployableHosts: options.requireDeployableHosts,
  })
  const validationErrors = issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.field}: ${issue.message}`)
  const validationWarnings = issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => `${issue.field}: ${issue.message}`)

  const plan = buildDataverseProvisionPlan(profile)
  const commands = buildPaConnectCommands(profile, plan)

  mkdirSync(outputDir, { recursive: true })
  const files: string[] = []

  const write = (name: string, contents: string) => {
    const target = join(outputDir, name)
    writeFileSync(target, contents, 'utf8')
    files.push(target)
  }

  write(
    'dataverse-webapi-plan.json',
    `${JSON.stringify(
      {
        apiRoot: plan.apiRoot,
        prefix: plan.prefix,
        tableLogicalNames: plan.tableLogicalNames,
        environmentVariableDefaults: plan.environmentVariableDefaults,
        requests: plan.requests,
      },
      null,
      2,
    )}\n`,
  )
  write(
    'dataverse-schema.json',
    `${JSON.stringify(plan.schema, null, 2)}\n`,
  )
  write(
    'environment-variable-defaults.json',
    `${JSON.stringify(plan.environmentVariableDefaults, null, 2)}\n`,
  )
  write('pa-connect.sh', renderPaCommandsScript(commands))
  write(
    'app.env.example',
    [
      '# Copy values into .env / Power Platform env vars. Hosts are not limited to Microsoft primary domains.',
      `VITE_DOCUMENT_API_BASE_URL=${profile.api.baseUrl}`,
      `VITE_SHAREPOINT_SITE_URL=${profile.sharePoint.siteUrl}`,
      `VITE_SHAREPOINT_LIBRARY_NAME=${profile.sharePoint.libraryName}`,
      `VITE_SHAREPOINT_FOLDER_PATH=${profile.sharePoint.folderPath ?? ''}`,
      `VITE_DATAVERSE_ENVIRONMENT_URL=${profile.dataverse.environmentUrl}`,
      '',
    ].join('\n'),
  )
  write(
    'SUMMARY.md',
    [
      '# Provision summary',
      '',
      `Publisher prefix: \`${plan.prefix}\``,
      `Dataverse Web API root: \`${plan.apiRoot}\``,
      '',
      '## Tables',
      ...plan.tableLogicalNames.map((name) => `- \`${name}\``),
      '',
      '## Next steps',
      '',
      '1. Set `DATAVERSE_ACCESS_TOKEN` and run `pnpm provision:apply` to create tables via Web API, **or** import a solution built from this schema.',
      '2. Review and run `pa-connect.sh` (replace `CONNECTION_ID`) to attach Code App data sources.',
      '3. Copy `app.env.example` into `.env` / environment variables.',
      '4. Implement / point your OpenAPI backend at these tables; keep SharePoint for PDF binaries only.',
      '',
      validationWarnings.length
        ? `## Warnings\n\n${validationWarnings.map((item) => `- ${item}`).join('\n')}\n`
        : '',
      validationErrors.length
        ? `## Errors\n\n${validationErrors.map((item) => `- ${item}`).join('\n')}\n`
        : '',
    ].join('\n'),
  )

  return {
    plan,
    outputDir,
    files,
    validationErrors,
    validationWarnings,
  }
}

/**
 * Applies a Web API plan using a bearer token. Skips create when entity already exists.
 */
export async function applyDataversePlan(
  plan: DataverseProvisionPlan,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, failed: [] }

  for (const request of plan.requests) {
    try {
      const outcome = await executePlanRequest(
        plan.apiRoot,
        request,
        accessToken,
        fetchImpl,
      )
      if (outcome === 'applied') {
        result.applied += 1
      } else {
        result.skipped += 1
      }
    } catch (error) {
      result.failed.push({
        description: request.description,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

async function executePlanRequest(
  apiRoot: string,
  request: WebApiRequestPlan,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<'applied' | 'skipped'> {
  if (request.skipIfExists && request.path === '/EntityDefinitions') {
    const schemaName = String(
      (request.body as { SchemaName?: string }).SchemaName ?? '',
    )
    const logical = schemaName.toLowerCase()
    const existing = await fetchImpl(
      `${apiRoot}/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      },
    )
    if (existing.ok) {
      return 'skipped'
    }
  }

  const response = await fetchImpl(`${apiRoot}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    // 404 means a missing route/prerequisite — never treat as "already exists".
    if (
      request.skipIfExists &&
      (response.status === 409 ||
        text.toLowerCase().includes('already exists') ||
        text.toLowerCase().includes('duplicate'))
    ) {
      return 'skipped'
    }
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

  return 'applied'
}
