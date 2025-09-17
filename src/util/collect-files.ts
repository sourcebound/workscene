import * as vscode from "vscode"
import * as path from "path"
  /**
     * paths.ts
     *
     * Yol/URI dönüşümlerini tek bir yerde toplar. Amaç cross-platform tutarlılık
     * (Windows/Linux/Mac) ve konfig dosyasında göreli yolları korumaktır.
     */

    /** Yerel dosya yolunu POSIX formatına çevirir ("\\" → "/"). */
    export function toPosix(p: string): string {
      return p.split(path.sep).join(path.posix.sep)
    }

    /**
     * Absolut dosya sistem yolunu, verilen köke göre göreli hale getirir.
     * Köke sahip değilsek POSIX normalize edilmiş absolut döner.
     */
    export function toRelativeFromFsPath(
      absFsPath: string,
      base: string
    ): string {
      if (!absFsPath) return ""
      if (!base) return toPosix(absFsPath)
      const rel = path.relative(base, absFsPath)
      return toPosix(rel)
    }

    /**
     * Göreli yol + kökten VS Code `Uri` üretir. Kök yoksa girdi mutlak kabul edilir.
     */
    export function fromRelativeToUri(rel: string, base: string): vscode.Uri {
      const abs = base ? path.join(base, rel) : rel
      return vscode.Uri.file(abs)
    }

    /**
     * Verilen mutlak dosya yolundan workspace'e göre en üst klasör etiketini döndürür.
     */
    export function labelForTopFolder(
      absPath: string,
      workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined =
        vscode.workspace.workspaceFolders
    ): string {
      let relative = absPath
      if (workspaceFolders?.length) {
        const match = workspaceFolders.find((f) =>
          toPosix(absPath).toLowerCase().startsWith(toPosix(f.uri.fsPath).toLowerCase())
        )
        if (match) relative = path.relative(match.uri.fsPath, absPath)
      }
      const normalized = toPosix(relative)
      const segs = normalized.split("/")
      return segs.length > 1 ? segs[0] : "Root"
    }

    // --- File collection helpers (for adding folders) ---
    export async function collectFilesRecursively(
      uri: vscode.Uri,
      fs: Pick<vscode.FileSystem, "readDirectory"> = vscode.workspace.fs
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

    export async function collectFilesFirstLevel(
      uri: vscode.Uri,
      fs: Pick<vscode.FileSystem, "readDirectory"> = vscode.workspace.fs
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