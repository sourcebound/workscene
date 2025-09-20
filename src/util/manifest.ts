import { workspace as vscWs } from 'vscode'
import Meta from '@type/meta'

// sürüm/kök yol bilgilerinin güncel tutulmasından sorumludur.
// Aktif workspace dizininden meta üretir.
export function getDefaultMeta(): Meta {
  const ws = vscWs.workspaceFolders?.[0]
  const basePath = ws ? ws.uri.fsPath : ''
  const now = new Date().toISOString()
  return { basePath, createdAt: now, updatedAt: now, version: 1 }
}
