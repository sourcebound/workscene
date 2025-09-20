import { TextDecoder } from 'util'
import type { ExtensionContext } from 'vscode'
import {
  RelativePattern,
  Uri,
  commands as vscCmds,
  window as vscWindow,
  workspace as vscWs,
} from 'vscode'

import State from '@type/state'
import * as l10n from '@vscode/l10n'
import TreeItem from '@model/tree-item'
import * as Message from '@lib/message'
import { TreeFileItem } from '@model/tree-file-item'
import { TreeGroupItem } from '@model/tree-group-item'
import { EXTENSION_ID } from '@lib/constants'
import { CONFIG_FILE_BASENAME, VIEW_ID } from '@lib/constants'
import { makeCommandId } from '@util/command-id'

import DataProvider from '@/data-provider'
import TreeItemKind from '@/enumeration/tree-item-kind'
import { ensureStateWithMeta } from '@util/normalize'
/**
 * @summary Eklentinin giriş noktası. Modüler yapıya ayrılmış sınıf ve yardımcıları
 * buradan içe aktarılır, TreeView oluşturulur ve komutlar kaydedilir.
 */
export async function activate(context: ExtensionContext) {
  /**
   * @summary Locale dosyasını yükler. Eğer yüklenemediğinde default strings kullanılır.
   */
  try {
    await l10n.config({
      contents: context.asAbsolutePath('l10n/bundle.l10n.json'),
    })
  } catch {
    // Bundle missing in dev mode; fall back to default strings.
  }

  /**
   * @summary Provider sınıf örneğini oluşturur.
   */
  const dataProvider = new DataProvider(context)

  /**
   * @summary TreeView'i oluşturur ve dataProvider'ı bağlar.
   */
  const treeView = vscWindow.createTreeView(VIEW_ID, {
    treeDataProvider: dataProvider,
    dragAndDropController: dataProvider,
    showCollapseAll: true,
    canSelectMany: true,
  })

  /**
   * @description TreeView'i dataProvider'a bağlar.
   */
  dataProvider.attachView?.(treeView)

  /**
   * @description Focus key context for item kind (group/file) to support Enter=Rename behavior
   */
  context.subscriptions.push(
    treeView.onDidChangeSelection(async (e) => {
      const sel = e.selection?.[0]
      const kind =
        sel instanceof TreeGroupItem
          ? TreeItemKind.Group.toString()
          : sel instanceof TreeFileItem
            ? TreeItemKind.File.toString()
            : undefined
      await vscCmds.executeCommand('setContext', makeCommandId('focusedKind'), kind)
    }),
  )

  /**
   * @description Dosya oluşturulduğunda, dosya silindiğinde, dosya yeniden adlandırıldığında veya dosya kaydedildiğinde treeview'ı, dataProvider'ın refresh metodunu çağırarak güncelle.
   */
  context.subscriptions.push(
    vscWs.onDidCreateFiles(() => dataProvider.refresh()),
    vscWs.onDidDeleteFiles(() => dataProvider.refresh()),
    vscWs.onDidRenameFiles(() => dataProvider.refresh()),
    vscWs.onDidSaveTextDocument(() => dataProvider.refresh()),
  )

  /**
   * @description Aktivasyon işlemi sırasında workspace folders değiştiğinde başlığı güncelle
   */
  dataProvider.updateTitle(vscWs.workspaceFolders)

  /**
   * @description Workspace'e workspace folders değiştiğinde başlığı günceller.
   */
  context.subscriptions.push(
    vscWs.onDidChangeWorkspaceFolders((e) => dataProvider.updateTitle(e.added)),
  )

  /**
   * @description Komutları kaydeder.
   * */
  context.subscriptions.push(
    /**
     * @summary `addGroup` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `addGroup` komutu, seçilen grupa veya seçilen grup yoksa yeni grup oluşturur.
     */
    vscCmds.registerCommand(makeCommandId('addGroup'), () => {
      const sel = treeView.selection?.[0]
      if (sel instanceof TreeGroupItem) return dataProvider.addGroup(sel)
      return dataProvider.addGroup()
    }),

    /**
     * @summary `addSubGroup` komutunu kaydeder.
     * @param g - Hedef grup.
     * @description `addSubGroup` komutu, seçilen grupa alt grup oluşturur.
     */
    vscCmds.registerCommand(makeCommandId('addSubGroup'), (g: TreeGroupItem) =>
      dataProvider.addSubGroup(g),
    ),
    /**
     * @summary `openAllInGroup` komutunu kaydeder.
     * @param g - Hedef grup.
     * @description `openAllInGroup` komutu, seçilen gruptaki tüm dosyaları açar.
     */
    vscCmds.registerCommand(makeCommandId('openAllInGroup'), (g: TreeGroupItem) =>
      dataProvider.openAllInGroup(g),
    ),

    /**
     * @summary `addOpenTabsToGroup` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `addOpenTabsToGroup` komutu, seçilen grupa veya seçilen grup yoksa yeni grup oluşturur.
     */
    vscCmds.registerCommand(makeCommandId('addOpenTabsToGroup'), (g?: TreeGroupItem) =>
      dataProvider.addOpenTabsToGroup(g),
    ),

    /**
     * @summary `renameGroup` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `renameGroup` komutu, seçilen grupın adını değiştirir.
     */
    vscCmds.registerCommand(makeCommandId('renameGroup'), (g?: TreeGroupItem) => {
      const target =
        g ??
        (treeView.selection?.[0] instanceof TreeGroupItem
          ? (treeView.selection?.[0] as TreeGroupItem)
          : undefined)
      if (target) return dataProvider.renameGroup(target)
    }),

    /**
     * @summary `editGroupMeta` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `editGroupMeta` komutu, seçilen grupın meta verilerini düzenler.
     */
    vscCmds.registerCommand(makeCommandId('editGroupMeta'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      const target = g ?? fallback
      if (target) return dataProvider.editGroupMeta(target)
    }),

    /**
     * @summary `addFiles` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `addFiles` komutu, seçilen grupa dosya ekleme.
     */
    vscCmds.registerCommand(makeCommandId('addFiles'), (g?: TreeGroupItem) =>
      dataProvider.addFiles(g),
    ),

    /**
     * @summary `remove` komutunu kaydeder.
     * @param it - Hedef öğe; verilmezse seçimden alınır.
     * @description `remove` komutu, seçilen öğeyi kaldırır.
     */
    vscCmds.registerCommand(makeCommandId('remove'), (it?: TreeItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.length ? (selection[0] as TreeItem) : undefined
      return dataProvider.remove(it ?? fallback)
    }),

    /**
     * @summary `moveToGroup` komutunu kaydeder.
     * @param it - Hedef öğe; verilmezse seçimden alınır.
     * @description `moveToGroup` komutu, seçilen öğeyi başka bir gruba taşır.
     */
    vscCmds.registerCommand(makeCommandId('moveToGroup'), (it?: TreeFileItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeFileItem => sel instanceof TreeFileItem)
      return dataProvider.moveToGroup(it ?? fallback)
    }),

    /**
     * @summary `editFileMeta` komutunu kaydeder.
     * @param it - Hedef öğe.
     * @description `editFileMeta` komutu, seçilen dosyanın meta verilerini düzenler.
     */
    vscCmds.registerCommand(makeCommandId('editFileMeta'), (it: TreeFileItem) =>
      dataProvider.editFileAliasDescription(it),
    ),

    /**
     * @summary `editFileTags` komutunu kaydeder.
     * @param it - Hedef öğe.
     * @description `editFileTags` komutu, seçilen dosyanın etiketlerini düzenler.
     */
    vscCmds.registerCommand(makeCommandId('editFileTags'), (it: TreeFileItem) =>
      dataProvider.editFileTags(it),
    ),
    /**
     * @summary `sortGroup` komutunu kaydeder.
     * @param g - Hedef grup.
     * @description `sortGroup` komutu, seçilen gruptaki dosyaları sıralar.
     */
    vscCmds.registerCommand(makeCommandId('sortGroup'), (g: TreeGroupItem) =>
      dataProvider.sortGroup(g),
    ),
    vscCmds.registerCommand(makeCommandId('filterGroups'), () => dataProvider.setGroupFilter()),
    vscCmds.registerCommand(makeCommandId('clearFilter'), () => dataProvider.clearGroupFilter()),

    /**
     * Grup simgesini değiştirir.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @returns İşlem tamamlandığında void.
     */
    vscCmds.registerCommand(makeCommandId('changeGroupIcon'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      return dataProvider.changeGroupIcon(g ?? fallback)
    }),

    /**
     * Grup rengini değiştirir.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @returns İşlem tamamlandığında void.
     */
    vscCmds.registerCommand(makeCommandId('changeGroupColor'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      return dataProvider.changeGroupColor(g ?? fallback)
    }),

    /**
     * @summary `editGroupTags` komutunu kaydeder.
     * @param g - Hedef grup; verilmezse seçimden alınır.
     * @description `editGroupTags` komutu, seçilen grupın etiketlerini düzenler.
     */
    vscCmds.registerCommand(makeCommandId('editGroupTags'), (g?: TreeGroupItem) => {
      const selection = treeView.selection ?? []
      const fallback = selection.find((sel): sel is TreeGroupItem => sel instanceof TreeGroupItem)
      const target = g ?? fallback
      if (target) return dataProvider.editGroupTags(target)
    }),

    /**
     * @summary `export` komutunu kaydeder.
     * @description `export` komutu, grupları dosyaya dışa aktarır.
     */
    vscCmds.registerCommand(makeCommandId('export'), () => dataProvider.exportGroupsToFile()),

    /**
     * @summary `import` komutunu kaydeder.
     * @description `import` komutu, grupları dosyadan içe aktarır.
     */
    vscCmds.registerCommand(makeCommandId('import'), () => dataProvider.importGroupsFromFile()),

    /**
     * @summary `undoCloseEditors` komutunu kaydeder.
     * @description `undoCloseEditors` komutu, kapatılan dosyaları geri alır.
     */
    vscCmds.registerCommand(makeCommandId('undoCloseEditors'), () =>
      dataProvider.undoCloseEditors(),
    ),

    /**
     * @summary `saveNow` komutunu kaydeder.
     * @description `saveNow` komutu, grupları kaydeder.
     */
    vscCmds.registerCommand(makeCommandId('saveNow'), async () => {
      // UI'yi anında güncelle: menüden düşsün
      await vscCmds.executeCommand('setContext', makeCommandId('canSave'), false)
      try {
        await dataProvider.saveNow()
      } catch {
        // Hata olursa yeniden etkinleştir ve bildir
        await vscCmds.executeCommand('setContext', makeCommandId('canSave'), true)
        vscWindow.showErrorMessage(Message.Error.saveFailed())
      }
    }),

    /**
     * @summary `refresh` komutunu kaydeder.
     * @description `refresh` komutu, grupları yeniler.
     */
    vscCmds.registerCommand(makeCommandId('refresh'), () => dataProvider.refresh()),

    /**
     * @summary `addToGroupFromExplorer` komutunu kaydeder.
     * @param resource - Hedef kaynak.
     * @param selected - Seçilen kaynaklar.
     * @description `addToGroupFromExplorer` komutu, seçilen öğeleri gruba ekle.
     */
    vscCmds.registerCommand(
      makeCommandId('addToGroupFromExplorer'),
      (resource: Uri, selected?: Uri[]) =>
        dataProvider.addExplorerResourcesToGroup(resource, selected),
    ),

    /**
     * @summary `expandAll` komutunu kaydeder.
     * @description `expandAll` komutu, tüm grupları genişletir.
     */
    vscCmds.registerCommand(makeCommandId('expandAll'), async () => {
      const roots = await dataProvider.getChildren()
      if (!roots || roots.length === 0) return
      let first = true
      for (const r of roots) {
        await treeView.reveal(r, { select: false, focus: first, expand: true })
        first = false
      }
    }),

    /**
     * @summary `applyTagFilter` komutunu kaydeder.
     * @param tag - Etiket.
     * @description `applyTagFilter` komutu, etikete göre filtreler.
     */
    vscCmds.registerCommand(makeCommandId('applyTagFilter'), (tag: string) =>
      dataProvider.applyTagFilter(tag),
    ),

    /**
     * @summary `clearTagFilter` komutunu kaydeder.
     * @description `clearTagFilter` komutu, etiket filtresini temizler.
     */
    vscCmds.registerCommand(makeCommandId('clearTagFilter'), () => dataProvider.clearTagFilter()),
  )

  /**
   * @summary `applyActionVisibilityFromConfig` komutunu kaydeder.
   * @description `applyActionVisibilityFromConfig` komutu, inline butonların görünürlüğünü ayarlar.
   */
  const applyActionVisibilityFromConfig = async () => {
    const cfg = vscWs.getConfiguration(EXTENSION_ID)
    const ids = (
      cfg.get<string[]>('itemAccessoryActionIds') ||
      cfg.get<string[]>('itemAccesoryActionsIds') || ['add-subgroup', 'remove']
    )
      .filter((s) => typeof s === 'string')
      .map((s) => s.trim().toLowerCase())

    const allow = new Set(ids)
    const set = (key: string, value: boolean) =>
      vscCmds.executeCommand('setContext', makeCommandId('action.' + key), value)

    const allKeys = ['add-subgroup', 'remove']
    await Promise.all(allKeys.map((k) => set(k, false)))
    await Promise.all(Array.from(allow).map((k) => set(k, true)))
  }
  void applyActionVisibilityFromConfig()

  /**
   * @summary `onDidChangeConfiguration` komutunu kaydeder.
   * @description `onDidChangeConfiguration` komutu, konfigürasyon değiştiğinde inline butonların görünürlüğünü ayarlar.
   */
  context.subscriptions.push(
    vscWs.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(makeCommandId('itemAccessoryActionIds')) ||
        e.affectsConfiguration(makeCommandId('itemAccesoryActionsIds'))
      ) {
        void applyActionVisibilityFromConfig()
      }
    }),
  )

  const ws = vscWs.workspaceFolders?.[0]
  if (ws) {
    const watcher = vscWs.createFileSystemWatcher(new RelativePattern(ws, CONFIG_FILE_BASENAME))
    let reloadTimer: ReturnType<typeof setTimeout> | undefined
    const reload = async () => {
      const u = Uri.joinPath(ws.uri, CONFIG_FILE_BASENAME)
      try {
        if ((dataProvider as any)._isWriting) {
          return
        }
        const content = await vscWs.fs.readFile(u)
        const text = new TextDecoder('utf-8').decode(content)
        const parsed = JSON.parse(text) as Partial<State>
        ;(dataProvider as any)._state = ensureStateWithMeta(parsed)
        dataProvider.refresh()
        ;(dataProvider as any).syncSavedSignatureWithState?.()
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
        ;(dataProvider as any)._state = ensureStateWithMeta({
          groups: [],
        } as any)
        dataProvider.refresh()
      }),
    )
    /**
     * @description Konfigürasyon dosyasını yeniler.
     */
    void reload()
  }
  /** Aktivasyon sonu */
}

/**
 * @summary `deactivate` komutunu kaydeder.
 * @description `deactivate` komutu, eklentiyi devre dışı bırakır. Bu fonksiyon çağrıldığında eklenti devre dışı bırakılır.
 */
export function deactivate() {
  // Eklenti devre dışı bırakıldığında yapılacak işlemler.
}
