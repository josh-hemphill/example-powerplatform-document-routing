/**
 * Document types and default approval chains.
 * Add or edit entries here for each routing use case in your org.
 */
export interface ApproverTemplate {
  displayName: string
  email: string
  role: string
}

export interface DocumentTypeDefinition {
  id: string
  label: string
  description: string
  /** Prefills the freeform request field on "New request". */
  requestHint: string
  /**
   * Markdown scaffold inserted when an author opens a new draft.
   * Use {{title}} and {{request}} placeholders.
   */
  draftTemplate: string
  /** Override app-level SharePoint folder for this type. */
  folderPath?: string
  /** Ordered approval chain applied when submitting for approval. */
  approvalChain: ApproverTemplate[]
}

export const documentTypes: DocumentTypeDefinition[] = [
  {
    id: 'policy',
    label: 'Policy',
    description: 'Corporate or departmental policy documents',
    requestHint:
      'Describe the policy outcome, who it applies to, and any must-have controls or exceptions.',
    draftTemplate: `# {{title}}

## Purpose
Summarize why this policy exists.

## Scope
Who and what this policy covers.

## Policy
- 

## Related request
{{request}}
`,
    folderPath: '/Policies',
    approvalChain: [
      {
        displayName: 'Jordan Legal',
        email: 'jordan.legal@contoso.com',
        role: 'Legal',
      },
      {
        displayName: 'Sam Compliance',
        email: 'sam.compliance@contoso.com',
        role: 'Compliance',
      },
    ],
  },
  {
    id: 'sop',
    label: 'SOP',
    description: 'Standard operating procedure / how-to',
    requestHint:
      'Describe the process steps that need documenting, systems involved, and the owning team.',
    draftTemplate: `# {{title}}

## Overview
{{request}}

## Prerequisites
- 

## Procedure
1. 

## Verification
- 
`,
    folderPath: '/SOPs',
    approvalChain: [
      {
        displayName: 'Casey Operations',
        email: 'casey.ops@contoso.com',
        role: 'Process Owner',
      },
      {
        displayName: 'Riley QA',
        email: 'riley.qa@contoso.com',
        role: 'Quality',
      },
    ],
  },
  {
    id: 'announcement',
    label: 'Announcement',
    description: 'Org-wide or team announcement for publication',
    requestHint:
      'Paste talking points, audience, publish date, and any links that must appear.',
    draftTemplate: `# {{title}}

{{request}}

## Call to action
- 
`,
    folderPath: '/Announcements',
    approvalChain: [
      {
        displayName: 'Morgan Communications',
        email: 'morgan.comms@contoso.com',
        role: 'Communications',
      },
    ],
  },
]

export const DEFAULT_DOCUMENT_TYPE_ID = documentTypes[0]!.id

/**
 * Looks up a document type by id, falling back to the default type.
 */
export function getDocumentType(
  id: string | null | undefined,
): DocumentTypeDefinition {
  return documentTypes.find((type) => type.id === id) ?? documentTypes[0]!
}

/**
 * Builds a draft Markdown body from the type template.
 */
export function buildDraftFromTemplate(
  type: DocumentTypeDefinition,
  title: string,
  request: string,
): string {
  return type.draftTemplate
    .replaceAll('{{title}}', title)
    .replaceAll('{{request}}', request)
}

/**
 * Select items for Vuetify selects.
 */
export function documentTypeSelectItems(): Array<{
  title: string
  value: string
  subtitle: string
}> {
  return documentTypes.map((type) => ({
    title: type.label,
    value: type.id,
    subtitle: type.description,
  }))
}
