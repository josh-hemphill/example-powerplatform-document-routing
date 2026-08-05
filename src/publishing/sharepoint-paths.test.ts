import { describe, expect, it } from 'vitest'
import {
  buildSharePointDocumentUrl,
  normalizeSharePointFolderPath,
} from '@/publishing/sharepoint-paths'

describe('normalizeSharePointFolderPath', () => {
  it('returns empty for root-like values', () => {
    expect(normalizeSharePointFolderPath(undefined)).toBe('')
    expect(normalizeSharePointFolderPath('/')).toBe('')
    expect(normalizeSharePointFolderPath('')).toBe('')
  })

  it('adds a leading slash when missing', () => {
    expect(normalizeSharePointFolderPath('Policies')).toBe('/Policies')
  })

  it('strips duplicate leading and trailing slashes', () => {
    expect(normalizeSharePointFolderPath('//Policies/Q3//')).toBe('/Policies/Q3')
  })
})

describe('buildSharePointDocumentUrl', () => {
  it('joins site, library, folder, and file without collapsing segments', () => {
    expect(
      buildSharePointDocumentUrl({
        siteUrl: 'https://contoso.sharepoint.com/sites/Policies/',
        libraryName: 'Published Documents',
        folderPath: 'Policies',
        fileName: 'travel.pdf',
      }),
    ).toBe(
      'https://contoso.sharepoint.com/sites/Policies/Published%20Documents/Policies/travel.pdf',
    )
  })
})
