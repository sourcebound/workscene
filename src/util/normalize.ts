import * as vscode from 'vscode'
import * as path from 'path'
import State from '@type/state'
import { getDefaultMeta } from '@/util/manifest'
import { toRelativeFromFsPath, toPosix } from '@util/collect-files'
import FileEntry from '@type/file-entry'
import Group from '@type/group'

/** Parçalı gelen state'i meta ve giriş normalize edilerek tamamlar. */
export function ensureStateWithMeta(input: Partial<State> | undefined): State {
  const defaults = getDefaultMeta()
  const meta = (input as any)?.meta ?? {}
  const groups = (input as any)?.groups ?? []
  const out: State = {
    meta: {
      basePath: meta.basePath ?? defaults.basePath,
      createdAt: meta.createdAt ?? defaults.createdAt,
      updatedAt: meta.updatedAt ?? defaults.updatedAt,
      version: typeof meta.version === 'number' ? meta.version : 1,
    },
    groups,
  }
  return normalizeStateEntries(out)
}

/** Giriş değerini (URI/absolut/göreli) normalize eder ve göreli hale getirir. */
export function normalizeEntry(input: string, base: string): string {
  try {
    if (!input) return input
    if (input.startsWith('file:')) {
      const fsPath = vscode.Uri.parse(input).fsPath
      return toRelativeFromFsPath(fsPath, base)
    }
    if (path.isAbsolute(input)) {
      return toRelativeFromFsPath(input, base)
    }
    return toPosix(input)
  } catch {
    return input
  }
}

/** FileEntry'i normalize eder (string ise rel'e sarar). */
export function normalizeFileEntry(input: string | FileEntry, base: string): FileEntry {
  if (typeof input === 'string') {
    return { rel: normalizeEntry(input, base), kind: 'file', tags: [] }
  }
  return {
    rel: normalizeEntry(input.rel, base),
    name: input.name,
    description: input.description,
    kind: input.kind ?? 'file',
    tags: normalizeTags((input as any).tags ?? []),
  }
}

/**
 * Etiket dizisini normalize eder: metni budar, boş olanları atar ve küçük harfe göre benzersizleştirir.
 * İlk görünen etiketi (orijinal biçimiyle) korur.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Map<string, string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, trimmed)
    }
  }
  return Array.from(seen.values())
}

/** Grup içindeki tüm yolları normalize eder (özyinelemeli). */
export function normalizeGroup(g: Group, base: string): Group {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    files: ((g.files as any[]) ?? []).map((f) => normalizeFileEntry(f as any, base)),
    children: (g.children ?? []).map((c) => normalizeGroup(c, base)),
    tags: normalizeTags((g as any).tags ?? []),
    iconId: g.iconId,
    colorName: g.colorName,
  }
}

/** Tüm state'i normalize eder. */
export function normalizeStateEntries(state: State): State {
  const base = state.meta.basePath
  const next: State = {
    meta: state.meta,
    groups: state.groups.map((g) => normalizeGroup(g, base)),
  }
  return next
}
