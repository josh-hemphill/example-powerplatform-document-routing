/**
 * Declarative Dataverse schema for Document Routing (mirrors openapi/document-routing.yaml).
 */

export type DataverseColumnType =
  | 'string'
  | 'memo'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'datetime'
  | 'choice'
  | 'lookup'

export interface DataverseChoiceOption {
  value: number
  label: string
}

export interface DataverseColumnDefinition {
  /** Logical name without publisher prefix (prefix is applied at generate time). */
  schemaName: string
  displayName: string
  description?: string
  type: DataverseColumnType
  required?: boolean
  maxLength?: number
  precision?: number
  /** For choice columns */
  options?: DataverseChoiceOption[]
  /** For lookup columns — target table schema name without prefix */
  targetTable?: string
  /** Primary name column for the table */
  isPrimaryName?: boolean
}

export interface DataverseTableDefinition {
  schemaName: string
  displayName: string
  displayNamePlural: string
  description: string
  ownership: 'user' | 'organization'
  columns: DataverseColumnDefinition[]
}

export interface EnvironmentVariableDefinition {
  schemaName: string
  displayName: string
  description: string
  /** Connection profile path used to seed default value, e.g. sharePoint.siteUrl */
  defaultFrom?: string
  type: 'string' | 'json'
}

export interface DataverseSchema {
  tables: DataverseTableDefinition[]
  environmentVariables: EnvironmentVariableDefinition[]
}

export const DEFAULT_OPTION_VALUE_PREFIX = 72_700

/**
 * Builds choice option values from a publisher option-value prefix (e.g. 72700 → 727000000+).
 */
export function choiceOptionsFromPrefix(
  optionValuePrefix: number,
  entries: Array<{ offset: number; label: string }>,
): DataverseChoiceOption[] {
  const base = optionValuePrefix * 10_000
  return entries.map((entry) => ({
    value: base + entry.offset,
    label: entry.label,
  }))
}

function buildChoiceSets(optionValuePrefix: number): {
  documentStatuses: DataverseChoiceOption[]
  priorities: DataverseChoiceOption[]
  stepStatuses: DataverseChoiceOption[]
  assignmentModes: DataverseChoiceOption[]
} {
  return {
    documentStatuses: choiceOptionsFromPrefix(optionValuePrefix, [
      { offset: 0, label: 'requested' },
      { offset: 1, label: 'drafting' },
      { offset: 2, label: 'in_review' },
      { offset: 3, label: 'approved' },
      { offset: 4, label: 'rejected' },
      { offset: 5, label: 'published' },
    ]),
    priorities: choiceOptionsFromPrefix(optionValuePrefix, [
      { offset: 10, label: 'low' },
      { offset: 11, label: 'normal' },
      { offset: 12, label: 'high' },
    ]),
    stepStatuses: choiceOptionsFromPrefix(optionValuePrefix, [
      { offset: 20, label: 'waiting' },
      { offset: 21, label: 'queued' },
      { offset: 22, label: 'pending' },
      { offset: 23, label: 'approved' },
      { offset: 24, label: 'rejected' },
      { offset: 25, label: 'skipped' },
    ]),
    assignmentModes: choiceOptionsFromPrefix(optionValuePrefix, [
      { offset: 30, label: 'named' },
      { offset: 31, label: 'pool' },
    ]),
  }
}

/**
 * Returns the Document Routing Dataverse schema for a publisher prefix.
 */
export function buildDataverseSchema(
  prefix: string,
  optionValuePrefix: number = DEFAULT_OPTION_VALUE_PREFIX,
): DataverseSchema {
  const p = prefix.toLowerCase()
  const { documentStatuses, priorities, stepStatuses, assignmentModes } =
    buildChoiceSets(optionValuePrefix)
  const tables: DataverseTableDefinition[] = [
    {
      schemaName: 'document',
      displayName: 'Document Routing Document',
      displayNamePlural: 'Document Routing Documents',
      description:
        'Case record for freeform request → draft → approvals → publish',
      ownership: 'user',
      columns: [
        {
          schemaName: 'title',
          displayName: 'Title',
          type: 'string',
          required: true,
          maxLength: 400,
          isPrimaryName: true,
        },
        {
          schemaName: 'documenttype',
          displayName: 'Document Type',
          type: 'string',
          required: true,
          maxLength: 100,
        },
        {
          schemaName: 'status',
          displayName: 'Status',
          type: 'choice',
          required: true,
          options: documentStatuses,
        },
        {
          schemaName: 'freeformrequest',
          displayName: 'Freeform Request',
          type: 'memo',
          required: true,
          maxLength: 100_000,
        },
        {
          schemaName: 'priority',
          displayName: 'Priority',
          type: 'choice',
          options: priorities,
        },
        {
          schemaName: 'requesteremail',
          displayName: 'Requester Email',
          type: 'string',
          required: true,
          maxLength: 320,
        },
        {
          schemaName: 'authoremail',
          displayName: 'Author Email',
          type: 'string',
          maxLength: 320,
        },
        {
          schemaName: 'draftbodymarkdown',
          displayName: 'Draft Body Markdown',
          type: 'memo',
          maxLength: 200_000,
        },
        {
          schemaName: 'draftsummary',
          displayName: 'Draft Summary',
          type: 'memo',
          maxLength: 10_000,
        },
        {
          schemaName: 'currentapproveremail',
          displayName: 'Current Approver Email',
          type: 'string',
          maxLength: 320,
        },
        {
          schemaName: 'currentstepstatus',
          displayName: 'Current Step Status',
          type: 'choice',
          options: stepStatuses,
        },
        {
          schemaName: 'currentstepdueat',
          displayName: 'Current Step Due At',
          type: 'datetime',
        },
        {
          schemaName: 'currentstepelevated',
          displayName: 'Current Step Elevated',
          type: 'boolean',
        },
        {
          schemaName: 'currentpoolemails',
          displayName: 'Current Pool Emails JSON',
          description: 'JSON array of emails eligible to claim the active pool step',
          type: 'memo',
          maxLength: 10_000,
        },
        {
          schemaName: 'publishedpdfurl',
          displayName: 'Published PDF URL',
          type: 'string',
          maxLength: 2000,
        },
        {
          schemaName: 'sharepointitemid',
          displayName: 'SharePoint Item Id',
          type: 'string',
          maxLength: 200,
        },
        {
          schemaName: 'requestedpublishsiteurl',
          displayName: 'Requested Publish Site URL',
          description: 'Free-form site URL; vanity / custom domains allowed',
          type: 'string',
          maxLength: 2000,
        },
        {
          schemaName: 'requestedlibraryname',
          displayName: 'Requested Library Name',
          type: 'string',
          maxLength: 400,
        },
        {
          schemaName: 'requestedfolderpath',
          displayName: 'Requested Folder Path',
          type: 'string',
          maxLength: 1000,
        },
        {
          schemaName: 'requestedfilename',
          displayName: 'Requested File Name',
          type: 'string',
          maxLength: 400,
        },
      ],
    },
    {
      schemaName: 'approvalstep',
      displayName: 'Document Routing Approval Step',
      displayNamePlural: 'Document Routing Approval Steps',
      description: 'Named or pool approval step with SLA / elevation fields',
      ownership: 'user',
      columns: [
        {
          schemaName: 'name',
          displayName: 'Name',
          type: 'string',
          required: true,
          maxLength: 400,
          isPrimaryName: true,
        },
        {
          schemaName: 'document',
          displayName: 'Document',
          type: 'lookup',
          required: true,
          targetTable: 'document',
        },
        {
          schemaName: 'order',
          displayName: 'Order',
          type: 'integer',
          required: true,
        },
        {
          schemaName: 'assignmentmode',
          displayName: 'Assignment Mode',
          type: 'choice',
          required: true,
          options: assignmentModes,
        },
        {
          schemaName: 'approveremail',
          displayName: 'Approver Email',
          type: 'string',
          maxLength: 320,
        },
        {
          schemaName: 'approverdisplayname',
          displayName: 'Approver Display Name',
          type: 'string',
          maxLength: 400,
        },
        {
          schemaName: 'role',
          displayName: 'Role',
          type: 'string',
          maxLength: 200,
        },
        {
          schemaName: 'status',
          displayName: 'Status',
          type: 'choice',
          required: true,
          options: stepStatuses,
        },
        {
          schemaName: 'pooljson',
          displayName: 'Pool JSON',
          type: 'memo',
          maxLength: 50_000,
        },
        {
          schemaName: 'elevationpooljson',
          displayName: 'Elevation Pool JSON',
          type: 'memo',
          maxLength: 50_000,
        },
        {
          schemaName: 'slahours',
          displayName: 'SLA Hours',
          type: 'decimal',
          precision: 2,
        },
        {
          schemaName: 'dueat',
          displayName: 'Due At',
          type: 'datetime',
        },
        {
          schemaName: 'claimedat',
          displayName: 'Claimed At',
          type: 'datetime',
        },
        {
          schemaName: 'elevated',
          displayName: 'Elevated',
          type: 'boolean',
        },
        {
          schemaName: 'elevatedat',
          displayName: 'Elevated At',
          type: 'datetime',
        },
        {
          schemaName: 'comment',
          displayName: 'Comment',
          type: 'memo',
          maxLength: 10_000,
        },
        {
          schemaName: 'decidedat',
          displayName: 'Decided At',
          type: 'datetime',
        },
      ],
    },
    {
      schemaName: 'historyevent',
      displayName: 'Document Routing History Event',
      displayNamePlural: 'Document Routing History Events',
      description: 'Audit trail entries for a document case',
      ownership: 'organization',
      columns: [
        {
          schemaName: 'name',
          displayName: 'Name',
          type: 'string',
          required: true,
          maxLength: 400,
          isPrimaryName: true,
        },
        {
          schemaName: 'document',
          displayName: 'Document',
          type: 'lookup',
          required: true,
          targetTable: 'document',
        },
        {
          schemaName: 'at',
          displayName: 'At',
          type: 'datetime',
          required: true,
        },
        {
          schemaName: 'actoremail',
          displayName: 'Actor Email',
          type: 'string',
          maxLength: 320,
        },
        {
          schemaName: 'action',
          displayName: 'Action',
          type: 'string',
          required: true,
          maxLength: 200,
        },
        {
          schemaName: 'message',
          displayName: 'Message',
          type: 'memo',
          maxLength: 10_000,
        },
      ],
    },
  ]

  const environmentVariables: EnvironmentVariableDefinition[] = [
    {
      schemaName: `${p}_SharePointSiteUrl`,
      displayName: 'SharePoint Site URL',
      description:
        'Target site for published PDFs. Any HTTPS host (vanity / custom domain OK).',
      defaultFrom: 'sharePoint.siteUrl',
      type: 'string',
    },
    {
      schemaName: `${p}_SharePointLibraryName`,
      displayName: 'SharePoint Library Name',
      description: 'Document library display name for published PDFs',
      defaultFrom: 'sharePoint.libraryName',
      type: 'string',
    },
    {
      schemaName: `${p}_SharePointFolderPath`,
      displayName: 'SharePoint Folder Path',
      description: 'Default folder under the library (leading slash)',
      defaultFrom: 'sharePoint.folderPath',
      type: 'string',
    },
    {
      schemaName: `${p}_DocumentApiBaseUrl`,
      displayName: 'Document Routing API Base URL',
      description:
        'OpenAPI / Custom Connector base URL for the Code App (not limited to Microsoft domains)',
      defaultFrom: 'api.baseUrl',
      type: 'string',
    },
    {
      schemaName: `${p}_DataverseEnvironmentUrl`,
      displayName: 'Dataverse Environment URL',
      description:
        'Org URL used by server-side API adapters (custom Dataverse domains supported)',
      defaultFrom: 'dataverse.environmentUrl',
      type: 'string',
    },
  ]

  return { tables, environmentVariables }
}

/**
 * Applies publisher prefix to a table/column schema name.
 */
export function prefixedLogicalName(prefix: string, schemaName: string): string {
  return `${prefix.toLowerCase()}_${schemaName.toLowerCase()}`
}
