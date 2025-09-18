import path from 'path'
import { normalizeEntry, normalizeTags, normalizeFileEntry, normalizeGroup } from '@util/normalize'
import type FileEntry from '@type/file-entry'
import type Group from '@type/group'
import { describe, expect, it } from '@jest/globals'

describe('normalizeEntry', () => {
  const base = path.join('/Users', 'dev', 'project')

  it('normalizes file URIs to relative POSIX paths', () => {
    const input = 'file:///Users/dev/project/src/index.ts'
    const result = normalizeEntry(input, base)
    expect(result).toBe('src/index.ts')
  })

  it('normalizes absolute filesystem paths to relative POSIX paths', () => {
    const input = path.join('/Users', 'dev', 'project', 'README.md')
    const result = normalizeEntry(input, base)
    expect(result).toBe('README.md')
  })

  it('normalizes relative paths to POSIX format without touching base path', () => {
    const input = path.join('src', 'nested', 'file.ts')
    const result = normalizeEntry(input, base)
    expect(result).toBe('src/nested/file.ts')
  })

  it('returns original value when parsing fails', () => {
    expect(normalizeEntry('not-a-uri', base)).toBe('not-a-uri')
  })
})

describe('normalizeTags', () => {
  it('trims, filters, and deduplicates tags while keeping first casing', () => {
    const tags = ['  Feature ', 'feature', 'BUG', 'bug', '  ', 'Enhancement']
    expect(normalizeTags(tags)).toEqual(['Feature', 'BUG', 'Enhancement'])
  })

  it('returns empty array for non-array inputs', () => {
    expect(normalizeTags('feature' as unknown)).toEqual([])
  })
})

describe('normalizeFileEntry', () => {
  const base = '/tmp/project'

  it('wraps string paths in a file entry', () => {
    const entry = normalizeFileEntry('src/main.ts', base)
    expect(entry).toEqual({ rel: 'src/main.ts', kind: 'file' })
  })

  it('normalizes nested file entry fields', () => {
    const entry: FileEntry = {
      rel: path.join(base, 'src', 'main.ts'),
      name: 'Main',
      description: 'Main entry point',
      kind: 'file',
    }
    expect(normalizeFileEntry(entry, base)).toEqual({
      rel: 'src/main.ts',
      name: 'Main',
      description: 'Main entry point',
      kind: 'file',
    })
  })
})

describe('normalizeGroup', () => {
  const base = '/repo'

  it('normalizes files, children, and tags recursively', () => {
    const group: Group = {
      id: 'root',
      name: 'Root',
      files: [
        path.join(base, 'README.md'),
        { rel: path.join(base, 'docs', 'guide.md'), name: 'Guide', kind: 'file' },
      ] as unknown as FileEntry[],
      children: [
        {
          id: 'child',
          name: 'Child',
          files: ['docs/child.md'] as unknown as FileEntry[],
          children: [],
          tags: [' Nested '],
        },
      ],
      tags: ['Root', 'root', '  FEATURE  '],
      iconId: 'root-icon',
      colorName: 'purple',
    }

    const normalized = normalizeGroup(group, base)

    expect(normalized.files).toEqual([
      { rel: 'README.md', kind: 'file' },
      { rel: 'docs/guide.md', name: 'Guide', kind: 'file' },
    ])
    expect(normalized.children).toBeDefined()
    const child = normalized.children?.[0]
    expect(child).toBeDefined()
    expect(child?.files).toEqual([{ rel: 'docs/child.md', kind: 'file' }])
    expect(normalized.tags).toEqual(['Root', 'FEATURE'])
  })
})
