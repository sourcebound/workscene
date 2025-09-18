import * as vscode from 'vscode'
import { TextDecoder } from 'util'
import Provider from './model/extension-provider'
import { CONFIG_FILE_BASENAME, VIEW_ID } from '@lib/constants'
import State from '@type/state'
import TreeItem from '@model/tree-item'
import { TreeGroupItem } from '@model/tree-group-item'
import { TreeFileItem } from '@model/tree-file-item'
import { ensureStateWithMeta } from './util/normalize'
import { makeCommandId, EXTENSION_ID } from '@lib/constants'
import TreeItemKind from './model/tree-item-kind'
import type { ExtensionContext } from 'vscode'

/**
 *
 * @description Eklentinin giriş noktası. Modüler yapıya ayrılmış sınıf ve yardımcıları
 * buradan içe aktarılır, TreeView oluşturulur ve komutlar kaydedilir.
 */
export function activate(context: ExtensionContext) {
  const provider = new Provider(context)

  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true,
    canSelectMany: true,
  })
  provider.attachView?.(treeView)

  // Focus key context for item kind (group/file) to support Enter=Rename behavior
  context.subscriptions.push(
    treeView.onDidChangeSelection(async (e) => {
      const sel = e.selection?.[0]
      const kind =
        sel instanceof TreeGroupItem
          ? TreeItemKind.Group.toString()
          : sel instanceof TreeFileItem
            ? TreeItemKind.File.toString()
            : undefined
      await vscode.commands.executeCommand('setContext', makeCommandId('focusedKind'), kind)
    }),
  )
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(() => provider.refresh()),
    vscode.workspace.onDidDeleteFiles(() => provider.refresh()),
    vscode.workspace.onDidRenameFiles(() => provider.refresh()),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh()),
  )

  // Görünüm başlığını mevcut workspace adıyla güncelle

  provider.updateTitle(vscode.workspace.workspaceFolders)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => provider.updateTitle(e.added)),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(makeCommandId('addGroup'), () => {
      const sel = treeView.selection?.[0]
      if (sel instanceof TreeGroupItem) return provider.addGroup(sel)
      return provider.addGroup()
    }),
    vscode.commands.registerCommand(makeCommandId('addSubGroup'), (g: TreeGroupItem) =>
      provider.addSubGroup(g),
    ),
    vscode.commands.registerCommand(makeCommandId('openAllInGroup'), (g: TreeGroupItem) =>
      provider.openAllInGroup(g),
    ),
    vscode.commands.registerCommand(makeCommandId('addOpenTabsToGroup'), (g?: TreeGroupItem) =>
      provider.addOpenTabsToGroup(g),
    ),
    vscode.commands.registerCommand(makeCommandId('renameGroup'), (g?: TreeGroupItem) => {
      const target =
        g ??
        (treeView.selection?.[0] instanceof TreeGroupItem
          ? (treeView.selection?.[0] as TreeGroupItem)
          : undefined)
      if (target) return provider.renameGroup(target)
    }),
    vscode.commands.registerCommand(makeCommandId('addFiles'), (g?: TreeGroupItem) =>
      provider.addFiles(g),
    ),
    vscode.commands.registerCommand(makeCommandId('remove'), (it?: TreeItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.length ? (selection[0] as TreeItem) : undefined
      return provider.remove(it ?? fallback)
    }),
    vscode.commands.registerCommand(makeCommandId('moveToGroup'), (it?: TreeFileItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeFileItem => sel instanceof TreeFileItem)
      return provider.moveToGroup(it ?? fallback)
    }),
    vscode.commands.registerCommand(makeCommandId('editFileMeta'), (it: TreeFileItem) =>
      provider.editFileAliasDescription(it),
    ),
    vscode.commands.registerCommand(makeCommandId('sortGroup'), (g: TreeGroupItem) =>
      provider.sortGroup(g),
    ),
    vscode.commands.registerCommand(makeCommandId('filterGroups'), () => provider.setGroupFilter()),
    vscode.commands.registerCommand(makeCommandId('clearFilter'), () =>
      provider.clearGroupFilter(),
    ),
    vscode.commands.registerCommand(makeCommandId('changeGroupIcon'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      return provider.changeGroupIcon(g ?? fallback)
    }),
    vscode.commands.registerCommand(makeCommandId('changeGroupColor'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      return provider.changeGroupColor(g ?? fallback)
    }),
    vscode.commands.registerCommand(makeCommandId('editGroupTags'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      const target = g ?? fallback
      if (target) return provider.editGroupTags(target)
    }),
    vscode.commands.registerCommand(makeCommandId('export'), () => provider.exportGroupsToFile()),
    vscode.commands.registerCommand(makeCommandId('import'), () => provider.importGroupsFromFile()),
    vscode.commands.registerCommand(makeCommandId('undoCloseEditors'), () =>
      provider.undoCloseEditors(),
    ),
    vscode.commands.registerCommand(makeCommandId('saveNow'), async () => {
      // UI'yi anında güncelle: menüden düşsün
      await vscode.commands.executeCommand('setContext', makeCommandId('canSave'), false)
      try {
        await provider.saveNow()
      } catch {
        // Hata olursa yeniden etkinleştir ve bildir
        await vscode.commands.executeCommand('setContext', makeCommandId('canSave'), true)
        vscode.window.showErrorMessage('Kaydetme başarısız oldu.')
      }
    }),
    vscode.commands.registerCommand(makeCommandId('refresh'), () => provider.refresh()),
    // Explorer bağlam menüsü: seçilen öğeleri gruba ekle
    vscode.commands.registerCommand(
      makeCommandId('addToGroupFromExplorer'),
      (resource: vscode.Uri, selected?: vscode.Uri[]) =>
        provider.addExplorerResourcesToGroup(resource, selected),
    ),
    vscode.commands.registerCommand(makeCommandId('expandAll'), async () => {
      const roots = await provider.getChildren()
      if (!roots || roots.length === 0) return
      let first = true
      for (const r of roots) {
        await treeView.reveal(r, { select: false, focus: first, expand: true })
        first = false
      }
    }),
    vscode.commands.registerCommand(makeCommandId('applyTagFilter'), (tag: string) =>
      provider.applyTagFilter(tag),
    ),
    vscode.commands.registerCommand(makeCommandId('clearTagFilter'), () =>
      provider.clearTagFilter(),
    ),
  )

  // Inline accessory visibility (only affects inline buttons): add-subgroup, remove
  const applyActionVisibilityFromConfig = async () => {
    const cfg = vscode.workspace.getConfiguration(EXTENSION_ID)
    const ids = (
      cfg.get<string[]>('itemAccessoryActionIds') ||
      cfg.get<string[]>('itemAccesoryActionsIds') || ['add-subgroup', 'remove']
    )
      .filter((s) => typeof s === 'string')
      .map((s) => s.trim().toLowerCase())

    const allow = new Set(ids)
    const set = (key: string, value: boolean) =>
      vscode.commands.executeCommand('setContext', makeCommandId(`action.${key}`), value)

    const allKeys = ['add-subgroup', 'remove']
    await Promise.all(allKeys.map((k) => set(k, false)))
    await Promise.all(Array.from(allow).map((k) => set(k, true)))
  }
  void applyActionVisibilityFromConfig()
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(makeCommandId('itemAccessoryActionIds')) ||
        e.affectsConfiguration(makeCommandId('itemAccesoryActionsIds'))
      ) {
        void applyActionVisibilityFromConfig()
      }
    }),
  )

  const ws = vscode.workspace.workspaceFolders?.[0]
  if (ws) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(ws, CONFIG_FILE_BASENAME),
    )
    let reloadTimer: ReturnType<typeof setTimeout> | undefined
    const reload = async () => {
      const u = vscode.Uri.joinPath(ws.uri, CONFIG_FILE_BASENAME)
      try {
        if ((provider as any)._isWriting) {
          return
        }
        const content = await vscode.workspace.fs.readFile(u)
        const text = new TextDecoder('utf-8').decode(content)
        const parsed = JSON.parse(text) as Partial<State>
        ;(provider as any)._state = ensureStateWithMeta(parsed)
        provider.refresh()
        ;(provider as any).syncSavedSignatureWithState?.()
      } catch {
        // Dosya yoksa ya da bozuksa: yut ve bozma.
      }
    }
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => void reload(), 150)
    }
    context.subscriptions.push(
      watcher,
      watcher.onDidChange(scheduleReload),
      watcher.onDidCreate(scheduleReload),
      watcher.onDidDelete(async () => {
        ;(provider as any)._state = ensureStateWithMeta({
          groups: [],
        } as any)
        provider.refresh()
      }),
    )
    void reload()
  }
}

export function deactivate() {}
