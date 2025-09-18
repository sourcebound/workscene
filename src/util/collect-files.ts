import * as vscode from 'vscode'
import * as path from 'path'

/** @description Yerel dosya yolunu POSIX formatına çevirir ("\\" → "/"). */
export function toPosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep)
}

/**
 * @description Absolut dosya sistem yolunu, verilen köke göre göreli hale getirir.
 * Köke sahip değilsek POSIX normalize edilmiş absolut döner.
 * @param absFsPath Absolut dosya sistem yolu
 * @param base Kök dizin
 * @returns Göreli yol
 */
export function toRelativeFromFsPath(absFsPath: string, base: string): string {
  if (!absFsPath) return ''
  if (!base) return toPosix(absFsPath)
  const rel = path.relative(base, absFsPath)
  return toPosix(rel)
}

/**
 * @description Göreli yol + kökten VS Code `Uri` üretir. Kök yoksa girdi mutlak kabul edilir.
 * @param rel Göreli yol
 * @param base Kök dizin
 * @returns VS Code `Uri`
 */
export function fromRelativeToUri(rel: string, base: string): vscode.Uri {
  const abs = base ? path.join(base, rel) : rel
  return vscode.Uri.file(abs)
}

/**
 * @description Verilen mutlak dosya yolundan workspace'e göre en üst klasör etiketini döndürür.
 * @param absPath Mutlak dosya yolu
 * @param workspaceFolders Workspace dizinleri
 * @returns En üst klasör etiketi
 */
export function labelForTopFolder(
  absPath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace
    .workspaceFolders,
): string {
  let relative = absPath
  if (workspaceFolders?.length) {
    const match = workspaceFolders.find((f) =>
      toPosix(absPath).toLowerCase().startsWith(toPosix(f.uri.fsPath).toLowerCase()),
    )
    if (match) relative = path.relative(match.uri.fsPath, absPath)
  }
  const normalized = toPosix(relative)
  const segs = normalized.split('/')
  return segs.length > 1 ? segs[0] : 'Root'
}

/**
 * @description Dosya koleksiyonu (klasörler için)
 * @param uri Dosya URI'si
 * @param fs Dosya sistemi
 * @returns Dosya URI'leri
 */
export async function collectFilesRecursively(
  uri: vscode.Uri,
  fs: Pick<vscode.FileSystem, 'readDirectory'> = vscode.workspace.fs,
): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = []
  const entries = await fs.readDirectory(uri)
  for (const [name, type] of entries) {
    const entryUri = vscode.Uri.joinPath(uri, name)
    if (type === vscode.FileType.File) {
      collected.push(entryUri)
    } else if (type === vscode.FileType.Directory) {
      const sub = await collectFilesRecursively(entryUri, fs)
      collected.push(...sub)
    }
  }
  return collected
}

/**
 * @description Dosya koleksiyonu (ilk seviye)
 * @param uri Dosya URI'si
 * @param fs Dosya sistemi
 * @returns Dosya URI'leri
 */
export async function collectFilesFirstLevel(
  uri: vscode.Uri,
  fs: Pick<vscode.FileSystem, 'readDirectory'> = vscode.workspace.fs,
): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = []
  const entries = await fs.readDirectory(uri)
  for (const [name, type] of entries) {
    if (type === vscode.FileType.File) {
      collected.push(vscode.Uri.joinPath(uri, name))
    }
  }
  return collected
}
