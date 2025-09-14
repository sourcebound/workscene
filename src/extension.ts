import * as vscode from "vscode"
import { TextDecoder } from "util"
import { Worksets } from "./worksets"

/**
 *
 * Eklentinin giriş noktası. Modüler yapıya ayrılmış sınıf ve yardımcıları
 * buradan içe aktarılır, TreeView oluşturulur ve komutlar kaydedilir.
 */
export function activate(context: vscode.ExtensionContext) {
  const provider = new Worksets.Provider(context)

  const treeView = vscode.window.createTreeView(Worksets.Defaults.VIEW_ID, {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true,
    canSelectMany: true,
  })

  // Ungrouped Tabs view
  const ungroupedProvider = new Worksets.UngroupedProvider(provider)
  const ungroupedView = vscode.window.createTreeView("worksceneUngroupedView", {
    treeDataProvider: ungroupedProvider,
    showCollapseAll: false,
  })
  context.subscriptions.push(
    ungroupedView,
    vscode.window.tabGroups.onDidChangeTabs(() => ungroupedProvider.refresh())
  )
  // Focus key context for item kind (group/file) to support Enter=Rename behavior
  context.subscriptions.push(
    treeView.onDidChangeSelection(async (e) => {
      const sel = e.selection?.[0]
      const kind = sel instanceof Worksets.TreeGroupItem ? "group" : sel instanceof Worksets.TreeFileItem ? "file" : undefined
      await vscode.commands.executeCommand("setContext", "workscene.focusedKind", kind)
    })
  )
  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(() => provider.refresh()),
    vscode.workspace.onDidDeleteFiles(() => provider.refresh()),
    vscode.workspace.onDidRenameFiles(() => provider.refresh()),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh())
  )

  // Görünüm başlığını mevcut workspace adıyla güncelle
  const updateTitle = () => {
    const ws = vscode.workspace.workspaceFolders?.[0]
    const projectName = ws?.name
    treeView.title = projectName ? `Workscene (${projectName})` : "Workscene"
  }
  updateTitle()
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(updateTitle)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("workscene.addGroup", () => {
      const sel = treeView.selection?.[0]
      if (sel instanceof Worksets.TreeGroupItem) return provider.addGroup(sel)
      return provider.addGroup()
    }),
    vscode.commands.registerCommand(
      "workscene.addSubGroup",
      (g: Worksets.TreeGroupItem) => provider.addSubGroup(g)
    ),
    vscode.commands.registerCommand(
      "workscene.openAllInGroup",
      (g: Worksets.TreeGroupItem) => provider.openAllInGroup(g)
    ),
    vscode.commands.registerCommand(
      "workscene.addOpenTabsToGroup",
      (g?: Worksets.TreeGroupItem) => provider.addOpenTabsToGroup(g)
    ),
    vscode.commands.registerCommand(
      "workscene.renameGroup",
      (g?: Worksets.TreeGroupItem) => {
        const target =
          g ??
          (treeView.selection?.[0] instanceof Worksets.TreeGroupItem
            ? (treeView.selection?.[0] as Worksets.TreeGroupItem)
            : undefined)
        if (target) return provider.renameGroup(target)
      }
    ),
    vscode.commands.registerCommand(
      "workscene.addFiles",
      (g?: Worksets.TreeGroupItem) => provider.addFiles(g)
    ),
    vscode.commands.registerCommand(
      "workscene.remove",
      (it?: Worksets.TreeItem) => {
        const target =
          it ??
          ((treeView.selection?.[0] as Worksets.TreeItem | undefined) ?? undefined)
        if (target) return provider.remove(target)
      }
    ),
    vscode.commands.registerCommand(
      "workscene.moveToGroup",
      (it: Worksets.TreeFileItem) => provider.moveToGroup(it)
    ),
    vscode.commands.registerCommand(
      "workscene.editFileMeta",
      (it: Worksets.TreeFileItem) => provider.editFileAliasDescription(it)
    ),
    vscode.commands.registerCommand(
      "workscene.sortGroup",
      (g: Worksets.TreeGroupItem) => provider.sortGroup(g)
    ),
    vscode.commands.registerCommand(
      "workscene.filterGroups",
      () => provider.setGroupFilter()
    ),
    vscode.commands.registerCommand(
      "workscene.clearFilter",
      () => provider.clearGroupFilter()
    ),
    vscode.commands.registerCommand(
      "workscene.changeGroupIcon",
      (g: Worksets.TreeGroupItem) => provider.changeGroupIcon(g)
    ),
    vscode.commands.registerCommand(
      "workscene.changeGroupColor",
      (g: Worksets.TreeGroupItem) => provider.changeGroupColor(g)
    ),
    vscode.commands.registerCommand(
      "workscene.export",
      () => provider.exportGroupsToFile()
    ),
    vscode.commands.registerCommand(
      "workscene.import",
      () => provider.importGroupsFromFile()
    ),
    vscode.commands.registerCommand(
      "workscene.undoCloseEditors",
      () => provider.undoCloseEditors()
    ),
    vscode.commands.registerCommand("workscene.saveNow", async () => {
      // UI'yi anında güncelle: menüden düşsün
      await vscode.commands.executeCommand("setContext", "workscene.canSave", false)
      try {
        await provider.saveNow()
      } catch (err) {
        // Hata olursa yeniden etkinleştir ve bildir
        await vscode.commands.executeCommand("setContext", "workscene.canSave", true)
        vscode.window.showErrorMessage("Kaydetme başarısız oldu.")
      }
    }),
    vscode.commands.registerCommand("workscene.refresh", () =>
      provider.refresh()
    ),
    // Explorer bağlam menüsü: seçilen öğeleri gruba ekle
    vscode.commands.registerCommand(
      "workscene.addToGroupFromExplorer",
      (resource: vscode.Uri, selected?: vscode.Uri[]) =>
        provider.addExplorerResourcesToGroup(resource, selected)
    ),
    vscode.commands.registerCommand(
      "workscene.expandAll",
      async () => {
        const roots = (await provider.getChildren()) as any[]
        if (!roots || roots.length === 0) return
        let first = true
        for (const r of roots) {
          await treeView.reveal(r, { select: false, focus: first, expand: true })
          first = false
        }
      }
    )
  )

  const ws = vscode.workspace.workspaceFolders?.[0]
  if (ws) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(ws, Worksets.Defaults.CONFIG_FILE_BASENAME)
    )
    let reloadTimer: ReturnType<typeof setTimeout> | undefined
    const reload = async () => {
      const u = vscode.Uri.joinPath(
        ws.uri,
        Worksets.Defaults.CONFIG_FILE_BASENAME
      )
      try {
        if ((provider as any)._isWriting) {
          return
        }
        const content = await vscode.workspace.fs.readFile(u)
        const text = new TextDecoder("utf-8").decode(content)
        const parsed = JSON.parse(text) as Partial<Worksets.Types.State>
        ;(provider as any)._state = Worksets.Utility.ensureStateWithMeta(parsed)
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
        ;(provider as any)._state = Worksets.Utility.ensureStateWithMeta({
          groups: [],
        } as any)
        provider.refresh()
      })
    )
    void reload()
  }
}

export function deactivate() {}
