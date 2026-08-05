import { describe, expect, it } from 'vitest'
import {
  buildDraftFromTemplate,
  getDocumentType,
} from '@/config/document-types'
import {
  matchesInboxPersona,
} from '@/config/inbox-personas'
import {
  buildPdfFileName,
  renderDocumentHtml,
  resolvePublishTargets,
} from '@/publishing/html-pdf-template'
import { appConfig } from '@/config/app.config'

describe('document types', () => {
  it('returns the default type for unknown ids', () => {
    expect(getDocumentType('missing').id).toBe('policy')
  })

  it('fills draft template placeholders', () => {
    const type = getDocumentType('policy')
    const draft = buildDraftFromTemplate(type, 'Travel Policy', 'Need updates')
    expect(draft).toContain('# Travel Policy')
    expect(draft).toContain('Need updates')
  })
})

describe('inbox personas', () => {
  it('matches available_in_pool for queued membership', () => {
    expect(
      matchesInboxPersona(
        {
          status: 'in_review',
          requesterEmail: 'a@contoso.com',
          currentStepStatus: 'queued',
          currentPoolEmails: ['me@contoso.com'],
        },
        'available_in_pool',
        'me@contoso.com',
      ),
    ).toBe(true)
  })

  it('matches waiting_on_me for pending assignees', () => {
    expect(
      matchesInboxPersona(
        {
          status: 'in_review',
          requesterEmail: 'a@contoso.com',
          currentApproverEmail: 'me@contoso.com',
          currentStepStatus: 'pending',
        },
        'waiting_on_me',
        'me@contoso.com',
      ),
    ).toBe(true)
  })

  it('matches waiting_on_me when status is omitted but assignee is set', () => {
    expect(
      matchesInboxPersona(
        {
          status: 'in_review',
          requesterEmail: 'a@contoso.com',
          currentApproverEmail: 'me@contoso.com',
        },
        'waiting_on_me',
        'me@contoso.com',
      ),
    ).toBe(true)
  })

  it('does not match waiting_on_me for queued pool membership', () => {
    expect(
      matchesInboxPersona(
        {
          status: 'in_review',
          requesterEmail: 'a@contoso.com',
          currentApproverEmail: 'me@contoso.com',
          currentStepStatus: 'queued',
          currentPoolEmails: ['me@contoso.com'],
        },
        'waiting_on_me',
        'me@contoso.com',
      ),
    ).toBe(false)
  })

  it('matches ready_to_publish for approved docs', () => {
    expect(
      matchesInboxPersona(
        {
          status: 'approved',
          requesterEmail: 'a@contoso.com',
        },
        'ready_to_publish',
        'anyone@contoso.com',
      ),
    ).toBe(true)
  })
})

describe('publishing helpers', () => {
  it('builds a slug file name', () => {
    expect(buildPdfFileName('Q3 Travel Policy!')).toBe('q3-travel-policy.pdf')
  })

  it('resolves SharePoint targets from app config and type folder', () => {
    const targets = resolvePublishTargets({
      id: '1',
      title: 'Policy',
      documentType: 'policy',
      freeformRequest: 'x',
      requesterEmail: 'a@contoso.com',
    })
    expect(targets.siteUrl).toBe(appConfig.sharePoint.siteUrl)
    expect(targets.folderPath).toBe('/Policies')
  })

  it('renders HTML that includes title and brand', () => {
    const html = renderDocumentHtml({
      id: '1',
      title: 'Policy One',
      documentType: 'policy',
      freeformRequest: 'Please write this',
      draftBodyMarkdown: '# Body',
      requesterEmail: 'a@contoso.com',
    })
    expect(html).toContain('Policy One')
    expect(html).toContain(appConfig.brand.name)
    expect(html).toContain('# Body')
  })
})
