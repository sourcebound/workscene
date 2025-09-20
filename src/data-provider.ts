import * as path from 'path'
import { v4 as UUID } from 'uuid'
import { TextDecoder, TextEncoder } from 'util'

import State from '@type/state'
import Group from '@type/group'
import FileEntry from '@type/file-entry'
import TreeItem from '@model/tree-item'

import FolderHandlingMode from '@/type/folder-handling'
import { CONFIG_FILE_BASENAME, EXTENSION_ID, EXTENSION_NAME, VIEW_ID } from '@lib/constants'

import {
  collectFilesRecursively,
  collectFilesFirstLevel,
  labelForTopFolder,
  toPosix,
  toRelativeFromFsPath,
  fromRelativeToUri,
} from '@util/collect-files'

import defaultPalette from '@/lib/palette'
import { TreeTagClearItem } from '@model/tree-tag-clear-item'
import { TreeTagItem } from '@model/tree-tag-item'
import { TreeGroupItem } from '@model/tree-group-item'
import { TreeFileItem } from '@model/tree-file-item'
import { TreeTagGroupItem, TagStat } from '@model/tree-tag-group-item'
import { getDefaultMeta } from '@/util/manifest'
import { getGroupChildrenItems } from '@util/helper'
import { ensureStateWithMeta, normalizeTags } from '@util/normalize'
import { makeCommandId } from '@util/command-id'
import {
  ExtensionContext,
  OutputChannel,
  TreeDataProvider,
  TreeDragAndDropController,
  Uri,
  EventEmitter,
  WorkspaceFolder,
  FileType,
  window as vscWindow,
  workspace as vscWorkspace,
  commands as vscCmds,
  ProviderResult,
  DataTransfer,
  DataTransferItem,
  ConfigurationTarget,
  QuickPickItem,
  TreeView,
} from 'vscode'
import * as Message from '@lib/message'
import symbols from '@/lib/symbol'

export default class DataProvider
  implements TreeDataProvider<TreeItem>, TreeDragAndDropController<TreeItem>
{
  /**
   * @description Dosya iç sürükle-bırak için mime type.
   * */
  readonly dropMimeTypes = [`application/vnd.code.tree.${VIEW_ID}`, 'text/uri-list']

  /**
   * @description Drag mime types
   * @description Dosya dış sürükle-bırak için mime type.
   * */
  readonly dragMimeTypes = [`application/vnd.code.tree.${VIEW_ID}`]

  private _emitter = new EventEmitter<TreeItem | undefined | void>()

  /**
   * @description TreeView'ın veri değiştiğinde event.
   * */
  readonly onDidChangeTreeData = this._emitter.event

  private _state: State = ensureStateWithMeta({ groups: [] } as any)

  /**
   * @description State'i yüklenip yüklenmediğini kontrol eder.
   * */
  private _loaded = false

  /**
   * @description Save timer.
   * */
  private _saveTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @description UI context güncellemesini debounce ederek CPU yükünü azalt.
   * */
  private _contextTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @description Writing flag.
   * */
  private _isWriting = false

  /**
   * @description Son kaydedilen imza.
   * */
  private _lastSavedSignature: string = ''

  /**
   * @description Grup filtresi.
   * */
  private _groupFilter: string | undefined

  /**
   * @description Etiket filtresi.
   * */
  private _tagFilter: string | undefined

  /**
   * @description Son kapanmış sekmeler.
   * */
  private _recentlyClosed: string[] | null = null

  /**
   * @description Son kapanmış sekmeleri geri yükleme timeout.
   * */
  private _undoCloseTimeout: ReturnType<typeof setTimeout> | undefined

  /**
   * @description Output channel.
   * */
  private readonly out: OutputChannel

  /**
   * @description Text encoder.
   * */
  private static encoder = new TextEncoder()

  constructor(private readonly ctx: ExtensionContext) {
    this.out = vscWindow.createOutputChannel(EXTENSION_NAME)
    void this.init()
  }

  /**
   * @description TreeView.
   * */
  private _view: TreeView<TreeItem> | undefined

  /**
   * @description TreeView'ı bağlar.
   * */
  attachView(view: TreeView<TreeItem>) {
    this._view = view
  }

  /**
   * @description Seçili item'ları döndürür.
   * @description Komut için etkili seçimi döndürür. Eğer view zaten bir seçim içeriyorsa, seçimi döndürürken birincil item'ın da dahil olmasını sağlar.
   * */
  private getSelectedItems(primary?: TreeItem): TreeItem[] {
    const selection = this._view?.selection ?? []
    if (!selection.length && primary) return [primary]
    if (!selection.length) return []
    const set = new Set<TreeItem>()
    for (const it of selection) set.add(it)
    if (primary) set.add(primary)
    return Array.from(set)
  }

  /**
   * @description Grup target'ları döndürür.
   * @description Komut için etkili seçimi döndürür. Eğer view zaten bir seçim içeriyorsa, seçimi döndürürken birincil item'ın da dahil olmasını sağlar.
   * */
  private getGroupTargets(primary?: TreeGroupItem): TreeGroupItem[] {
    const selected = this.getSelectedItems(primary)
    const groups = selected.filter((it): it is TreeGroupItem => it instanceof TreeGroupItem)
    if (groups.length === 0 && primary instanceof TreeGroupItem) {
      return [primary]
    }
    return groups
  }

  /**
   * @description Dosya target'ları döndürür.
   * @description Komut için etkili seçimi döndürür. Eğer view zaten bir seçim içeriyorsa, seçimi döndürürken birincil item'ın da dahil olmasını sağlar.
   * */
  private getFileTargets(primary?: TreeFileItem): TreeFileItem[] {
    const selected = this.getSelectedItems(primary)
    const files = selected.filter((it): it is TreeFileItem => it instanceof TreeFileItem)
    if (files.length === 0 && primary instanceof TreeFileItem) {
      return [primary]
    }
    return files
  }

  /**
   * @description Başlatma işlemi.
   * */
  private async init(): Promise<void> {
    const u = this.configUri
    if (u) {
      try {
        const content = await vscWorkspace.fs.readFile(u)
        const text = new TextDecoder('utf-8').decode(content)
        const parsed = JSON.parse(text) as Partial<State>
        this._state = ensureStateWithMeta(parsed)
      } catch {
        this._state = ensureStateWithMeta({ groups: [] } as any)
      }
    }
    this._lastSavedSignature = this.computeSignature(this._state)
    void vscCmds.executeCommand('setContext', makeCommandId('canSave'), false)
    this._loaded = true
    this.refresh()
    void this.updateFilterContext()
  }

  /**
   * @description State'i döndürür.
   * */
  private get state(): State {
    return this._state
  }

  /**
   * @description State'i ayarlar.
   * */
  private set state(v: State) {
    const basePath = getDefaultMeta().basePath
    const now = new Date().toISOString()
    // v'nin zaten normalize olduğunu varsayıp meta'yı güncelle
    const next: State = {
      meta: {
        basePath,
        createdAt: this._state.meta?.createdAt || now,
        updatedAt: now,
        version: typeof this._state.meta?.version === 'number' ? this._state.meta.version : 1,
      },
      groups: v.groups,
    }
    this._state = next
    this.scheduleSave()
    this.scheduleCanSaveContextUpdate()
  }

  /**
   * @description Config URI'yi döndürür.
   * */
  private get configUri(): Uri | undefined {
    const ws = vscWorkspace.workspaceFolders?.[0]
    if (!ws) return undefined
    return Uri.joinPath(ws.uri, CONFIG_FILE_BASENAME)
  }

  /**
   * @description Kaydetme işlemi.
   * */
  private scheduleSave(): void {
    if (!this._loaded) return
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      void this.saveToDisk()
    }, 200)
  }

  /**
   * @description Konfigürasyonu diskte kaydet
   * */
  private async saveToDisk(): Promise<void> {
    const u = this.configUri
    if (!u) return
    const started = Date.now()
    const toWrite: State = {
      ...this._state,
      meta: {
        ...this._state.meta,
        updatedAt: new Date().toISOString(),
      },
    }
    const bytes = DataProvider.encoder.encode(JSON.stringify(toWrite, null, 2))
    try {
      this._isWriting = true
      await vscWorkspace.fs.writeFile(u, bytes)
    } catch {
      try {
        await vscWorkspace.fs.writeFile(u, bytes)
      } catch {
        /* yut */
      }
    } finally {
      setTimeout(() => {
        this._isWriting = false
      }, 200)
      this._lastSavedSignature = this.computeSignature(this._state)
      void this.updateCanSaveContext()
      const elapsed = Date.now() - started
      this.out.appendLine(Message.Info.createSaveToDiskOutputChannelMessage(elapsed, bytes))
    }
  }

  /** @description Manuel kaydet: bekleyen yazmayı iptal et, değişiklik yoksa yazma */
  async saveNow(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = undefined
    }
    const current = this.computeSignature(this._state)
    if (current === this._lastSavedSignature) {
      await this.updateCanSaveContext()
      return
    }
    await this.saveToDisk()
  }

  /** @description Dışarıdan yükleme sonrası imzayı senkronize eder */
  syncSavedSignatureWithState(): void {
    this._lastSavedSignature = this.computeSignature(this._state)
    void this.updateCanSaveContext()
  }

  /** @description Yalnızca anlamlı alanlardan deterministik imza üretir (timestamp hariç) */
  private computeSignature(state: State): string {
    const simplifyGroup = (g: Group): any => {
      const children = (g.children ?? []).map(simplifyGroup)
      children.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      const files = (g.files ?? []).map((fe) => ({
        rel: fe.rel || '',
        name: fe.name || '',
        description: fe.description || '',
        kind: fe.kind || 'file',
        tags: (fe.tags ?? []).slice(),
      }))
      files.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      return {
        id: g.id,
        name: g.name,
        description: g.description || '',
        iconId: g.iconId || '',
        colorName: g.colorName || '',
        tags: (g.tags ?? []).slice(),
        files,
        children,
      }
    }
    const groups = (state.groups ?? []).map(simplifyGroup)
    groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const simplified = {
      basePath: state.meta.basePath,
      version: state.meta.version,
      groups,
    }
    return JSON.stringify(simplified)
  }

  /** @description UI context güncellemesini debounce ederek CPU yükünü azalt */
  private scheduleCanSaveContextUpdate(): void {
    if (this._contextTimer) clearTimeout(this._contextTimer)
    this._contextTimer = setTimeout(() => {
      void this.updateCanSaveContext()
    }, 150)
  }

  /** @description UI context güncellemesini debounce ederek CPU yükünü azalt */
  private async updateCanSaveContext(): Promise<void> {
    const current = this.computeSignature(this._state)
    const canSave = current !== this._lastSavedSignature
    await vscCmds.executeCommand('setContext', makeCommandId('canSave'), canSave)
  }

  /** @description TreeView'ı yeniden yükler */
  refresh() {
    this._emitter.fire()
  }

  /** @description TreeView'ın item'ını döndürür */
  getTreeItem(el: TreeItem) {
    return el
  }

  /** @description TreeView'ın child'larını döndürür */
  getChildren(el?: TreeItem): ProviderResult<TreeItem[]> {
    const s = this.state
    if (!el) {
      const items: TreeItem[] = []
      const tagGroup = this.buildTagGroupItem()
      if (tagGroup) items.push(tagGroup)
      const roots = this.getFilteredRootGroups(s.groups)
      for (const g of roots) {
        items.push(new TreeGroupItem(g))
      }
      return items
    }
    if (el instanceof TreeTagGroupItem) {
      const items: TreeItem[] = []
      if (this._tagFilter) items.push(new TreeTagClearItem())
      for (const info of el.tags) {
        items.push(new TreeTagItem(info, this.isSameTag(info.tag, this._tagFilter)))
      }
      return items
    }
    if (el instanceof TreeTagItem || el instanceof TreeTagClearItem) {
      return []
    }
    if (el instanceof TreeGroupItem) return getGroupChildrenItems(el.group, s.meta.basePath)
    return []
  }

  /** @description TreeView'ın parent'ını döndürür */
  getParent(el: TreeItem): ProviderResult<TreeItem> {
    const s = this.state
    if (el instanceof TreeTagItem || el instanceof TreeTagClearItem) {
      return this.buildTagGroupItem() ?? null
    }
    if (el instanceof TreeTagGroupItem) return null
    if (el instanceof TreeFileItem) {
      const group = this.findGroupById(s.groups, el.groupId || '')?.group
      return group ? new TreeGroupItem(group) : null
    }
    if (el instanceof TreeGroupItem) {
      const found = this.findGroupById(s.groups, el.group.id)
      const parent = found?.parent
      return parent ? new TreeGroupItem(parent) : null
    }
    return null
  }

  /** @description Tag grup item'ını döndürür */
  private buildTagGroupItem(): TreeTagGroupItem | undefined {
    const stats = this.getTagStats()
    if (!stats.length && !this._tagFilter) return undefined
    return new TreeTagGroupItem(stats, this._tagFilter)
  }

  /** @description Filtered root groups'ı döndürür */
  private getFilteredRootGroups(groups: Group[]): Group[] {
    let results = groups
    if (this._tagFilter) {
      results = results.filter((g) => this.groupMatchesTag(g, this._tagFilter!))
    }
    if (this._groupFilter) {
      const needle = this._groupFilter.toLowerCase()
      results = results.filter((g) => (g.name || '').toLowerCase().includes(needle))
    }
    if (this._tagFilter) {
      const pruned = results
        .map((g) => this.pruneGroupForTagFilter(g, true))
        .filter((g): g is Group => !!g)
      return pruned
    }
    return results
  }

  /** @description Tag istatistiklerini döndürür */
  private getTagStats(): TagStat[] {
    const stats = new Map<string, { tag: string; groupIds: Set<string>; fileCount: number }>()
    const ensureEntry = (rawTag: string) => {
      const trimmed = rawTag.trim()
      if (!trimmed) return undefined
      const key = trimmed.toLowerCase()
      let entry = stats.get(key)
      if (!entry) {
        entry = { tag: trimmed, groupIds: new Set<string>(), fileCount: 0 }
        stats.set(key, entry)
      }
      return entry
    }
    const visit = (nodes: Group[]) => {
      for (const g of nodes) {
        for (const tag of g.tags ?? []) {
          const entry = ensureEntry(tag)
          if (entry) entry.groupIds.add(g.id)
        }
        for (const file of g.files ?? []) {
          for (const tag of file.tags ?? []) {
            const entry = ensureEntry(tag)
            if (entry) entry.fileCount += 1
          }
        }
        if (g.children?.length) visit(g.children)
      }
    }
    visit(this.state.groups)
    return Array.from(stats.values())
      .map<TagStat>((entry) => ({
        tag: entry.tag,
        groupCount: entry.groupIds.size,
        fileCount: entry.fileCount,
      }))
      .filter((entry) => entry.groupCount > 0 || entry.fileCount > 0)
      .sort((a, b) => a.tag.localeCompare(b.tag))
  }

  /** @description Grup etiketine göre eşleşmeyi kontrol eder */
  private groupMatchesTag(group: Group, tag: string): boolean {
    if (this.groupHasTag(group, tag) || this.groupHasFileWithTag(group, tag)) return true
    for (const child of group.children ?? []) {
      if (this.groupMatchesTag(child, tag)) return true
    }
    return false
  }

  /** @description Grup etiketine göre eşleşmeyi kontrol eder */
  private groupHasTag(group: Group, tag: string): boolean {
    return (group.tags ?? []).some((t) => this.isSameTag(t, tag))
  }

  /** @description Grup dosyası etiketine göre eşleşmeyi kontrol eder */
  private groupHasFileWithTag(group: Group, tag: string): boolean {
    return (group.files ?? []).some((f) => this.fileHasTag(f, tag))
  }

  /** @description Dosya etiketine göre eşleşmeyi kontrol eder */
  private fileHasTag(file: FileEntry, tag: string): boolean {
    return (file.tags ?? []).some((t) => this.isSameTag(t, tag))
  }

  /** @description Grup etiketine göre filtreleme yapar */
  private pruneGroupForTagFilter(group: Group, _isRoot = false): Group | undefined {
    if (!this._tagFilter) return group
    const tag = this._tagFilter
    const directMatch = this.groupHasTag(group, tag)
    const matchingFiles = (group.files ?? []).filter((f) => this.fileHasTag(f, tag))
    const originalChildren = group.children ?? []
    const prunedChildren = originalChildren
      .map((c) => this.pruneGroupForTagFilter(c, false))
      .filter((c): c is Group => !!c)

    if (directMatch) {
      if (prunedChildren.length === originalChildren.length) return group
      return {
        ...group,
        children: prunedChildren.length ? prunedChildren : undefined,
      }
    }

    if (matchingFiles.length || prunedChildren.length > 0) {
      return {
        ...group,
        files: matchingFiles.length ? matchingFiles : [],
        children: prunedChildren.length ? prunedChildren : undefined,
      }
    }

    return undefined
  }

  /** @description Etiketlerin eşleşip eşleşmediğini kontrol eder */
  private isSameTag(a: string, b: string | undefined): boolean {
    if (!b) return false
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }

  /** @description Aktif editör sekmelerindeki tüm dosyaları belirtilen gruba ekler veya seçim ister */
  async addOpenTabsToGroup(target?: TreeGroupItem): Promise<void> {
    const filePaths = this.getOpenEditorFilePaths()
    if (filePaths.length === 0) {
      vscWindow.showInformationMessage(Message.Info.noOpenTabs())
      return
    }
    const s = this.state
    const base = s.meta.basePath
    const rels = filePaths.map((p) => toRelativeFromFsPath(p, base)).filter(Boolean)

    let group: Group | undefined
    if (target) {
      group = this.findGroupById(s.groups, target.group.id)?.group
    } else {
      // Grup seçimi veya yeni grup oluşturma
      const items = [
        { label: Message.Label.quickPickNewGroup(), id: '__new__' },
        ...this.flattenGroups(s.groups).map((g) => ({
          label: g.pathLabel,
          id: g.id,
        })),
      ]
      const picked = await vscWindow.showQuickPick(items, {
        placeHolder: Message.Placeholder.selectGroupForTabs(),
      })
      if (!picked) return
      if (picked.id === '__new__') {
        const suggested = this.suggestGroupName(s.groups)
        const name = await vscWindow.showInputBox({
          prompt: Message.Prompt.newGroupName(),
          value: suggested,
        })
        if (name === undefined) return
        const finalName = name.trim() || suggested
        const newG: Group = {
          id: UUID(),
          name: finalName,
          files: [],
          children: [],
          tags: [],
        }
        s.groups.push(newG)
        group = newG
      } else {
        group = this.findGroupById(s.groups, picked.id!)?.group
      }
    }
    if (!group) return
    let added = 0
    for (const rel of rels) {
      if (!this.hasFileRel(group, rel, base)) {
        group.files.push({ rel, kind: 'file' })
        added++
      }
    }
    if (added > 0) {
      this.state = s
      this._emitter.fire(target)
    }
    vscWindow.showInformationMessage(Message.Info.addTabsToGroup(group.name, added))
  }

  /** @description Bir gruptaki tüm dosyaları editörde açar (varsa mevcut sekmeyi öne çıkarır) */
  async openAllInGroup(item: TreeGroupItem): Promise<void> {
    const s = this.state
    const base = s.meta.basePath
    const entries = item.group.files ?? []
    const fileEntries = entries.filter((fe) => (fe.kind ?? 'file') !== 'folder')
    if (fileEntries.length === 0) {
      vscWindow.showInformationMessage(Message.Info.noFilesToOpenInGroup())
      return
    }
    const skippedFolders = entries.length - fileEntries.length
    const autoClose = vscWorkspace
      .getConfiguration(EXTENSION_ID)
      .get<boolean>('autoCloseOnOpenAll', false)
    if (autoClose) {
      this._recentlyClosed = this.getOpenEditorFilePaths()
      await vscCmds.executeCommand('setContext', makeCommandId('canUndoClose'), true)
      if (this._undoCloseTimeout) clearTimeout(this._undoCloseTimeout)
      this._undoCloseTimeout = setTimeout(async () => {
        this._recentlyClosed = null
        await vscCmds.executeCommand('setContext', makeCommandId('canUndoClose'), false)
      }, 5000)
      await vscCmds.executeCommand('workbench.action.closeAllEditors')
    }
    for (let i = 0; i < fileEntries.length; i++) {
      const fe = fileEntries[i]
      const uri = fromRelativeToUri(fe.rel, base)
      try {
        if (await this.revealExistingTab(uri)) continue
        const doc = await vscWorkspace.openTextDocument(uri)
        await vscWindow.showTextDocument(doc, {
          preview: false,
          preserveFocus: i !== 0,
        })
      } catch {
        // dosya açılamazsa yut ve devam et
      }
    }
    if (skippedFolders > 0) {
      vscWindow.showInformationMessage(Message.Info.skippedFolders(skippedFolders))
    }
  }

  /** @description Kapatılan sekmeleri geri yükler */
  async undoCloseEditors(): Promise<void> {
    if (!this._recentlyClosed || this._recentlyClosed.length === 0) return
    for (const p of this._recentlyClosed) {
      try {
        const uri = Uri.file(p)
        if (await this.revealExistingTab(uri)) continue
        const doc = await vscWorkspace.openTextDocument(uri)
        await vscWindow.showTextDocument(doc, { preview: false })
      } catch {
        /* yut */
      }
    }
    this._recentlyClosed = null
    if (this._undoCloseTimeout) clearTimeout(this._undoCloseTimeout)
    await vscCmds.executeCommand('setContext', makeCommandId('canUndoClose'), false)
    vscWindow.showInformationMessage(Message.Info.closedTabsRestored())
  }

  /** @description Açık sekmeler arasında verilen URI'yi bulup ilgili grupta öne çıkarır */
  private async revealExistingTab(uri: Uri): Promise<boolean> {
    for (const group of vscWindow.tabGroups.all) {
      for (const tab of group.tabs) {
        const input: any = (tab as any).input
        if (!input || typeof input !== 'object' || !('uri' in input)) continue
        const tabUri = input.uri
        if (tabUri instanceof Uri && tabUri.fsPath === uri.fsPath) {
          const document = await vscWorkspace.openTextDocument(uri)
          await vscWindow.showTextDocument(document, {
            viewColumn: group.viewColumn,
            preview: false,
          })
          return true
        }
      }
    }
    return false
  }

  /** @description Aktif editor gruplarındaki tüm açık dosya yollarını toplar (file:// olanlar) */
  private getOpenEditorFilePaths(): string[] {
    const allTabs = vscWindow.tabGroups.all.flatMap((g) => g.tabs)
    const out: string[] = []
    for (const tab of allTabs) {
      const input: any = (tab as any).input
      if (input && typeof input === 'object' && 'uri' in input) {
        const uri: any = input.uri
        if (uri instanceof Uri && uri.scheme === 'file') {
          out.push(uri.fsPath)
        }
      }
    }
    return out
  }

  /** @description Grup ekleme */
  async addGroup(target?: TreeGroupItem) {
    const s = this.state
    const siblings = target
      ? (this.findGroupById(s.groups, target.group.id)?.group.children ?? [])
      : s.groups
    const suggested = this.suggestGroupName(siblings)
    const name = await vscWindow.showInputBox({
      prompt: Message.Prompt.groupName(),
      value: suggested,
    })
    if (name === undefined) return
    const finalName = name.trim() || suggested
    const newG: Group = {
      id: UUID(),
      name: finalName,
      files: [],
      children: [],
      tags: [],
    }
    if (target) {
      const found = this.findGroupById(s.groups, target.group.id)
      ;(found?.group.children ?? (found!.group.children = [])).push(newG)
    } else {
      s.groups.push(newG)
    }
    this.state = s
    this._emitter.fire()
    // Reveal and select the newly created group, expanding parents if needed
    setTimeout(() => {
      void this.revealGroupById(newG.id)
    }, 0)
  }

  /** @description Alt grup ekleme */
  async addSubGroup(target: TreeGroupItem) {
    return this.addGroup(target)
  }

  /** @description Grup adını değiştirme */
  async renameGroup(item: TreeGroupItem) {
    const name = await vscWindow.showInputBox({
      prompt: Message.Prompt.renameGroup(),
      value: item.group.name,
      valueSelection: [0, item.group.name.length],
    })
    if (!name) return
    const s = this.state
    const found = this.findGroupById(s.groups, item.group.id)?.group
    if (found) {
      found.name = name
      this.state = s
      this._emitter.fire(item)
    }
  }

  /** @description Grup meta verilerini düzenleme */
  async editGroupMeta(item: TreeGroupItem): Promise<void> {
    const s = this.state
    const target = this.findGroupById(s.groups, item.group.id)?.group
    if (!target) return
    const name = await vscWindow.showInputBox({
      prompt: Message.Prompt.groupName(),
      value: target.name,
      valueSelection: [0, target.name.length],
    })
    if (name === undefined) return
    const description = await vscWindow.showInputBox({
      prompt: Message.Prompt.descriptionOptional(),
      value: target.description ?? '',
    })
    if (description === undefined) return
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (trimmedName) target.name = trimmedName
    const nextDescription = trimmedDescription ? trimmedDescription : undefined
    target.description = nextDescription
    this.state = s
    this._emitter.fire(item)
  }

  async editGroupTags(item: TreeGroupItem): Promise<void> {
    const s = this.state
    const target = this.findGroupById(s.groups, item.group.id)?.group
    if (!target) return
    const current = target.tags ?? []
    const value = await vscWindow.showInputBox({
      prompt: Message.Prompt.groupTags(),
      placeHolder: Message.Placeholder.groupTags(),
      value: current.join(', '),
    })
    if (value === undefined) return
    const parts = value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const normalized = normalizeTags(parts)
    target.tags = normalized
    this.state = s
    this._emitter.fire(item)
    void this.updateFilterContext()
  }

  /** @description Grup veya dosya kaldırma */
  async remove(item?: TreeItem) {
    const targets = this.getSelectedItems(item).filter(
      (it): it is TreeGroupItem | TreeFileItem =>
        it instanceof TreeGroupItem || it instanceof TreeFileItem,
    )
    if (targets.length === 0) return
    const cfg = vscWorkspace.getConfiguration(EXTENSION_ID)
    const confirm = cfg.get<boolean>('confirmBeforeRemove', true)
    if (confirm) {
      let message: string
      if (targets.length === 1) {
        const single = targets[0]
        if (single instanceof TreeGroupItem) {
          const name = single.group.name
          message = Message.Warning.confirmRemoveGroup(name)
        } else {
          const name = single.entry.name || single.entry.rel
          message = Message.Warning.confirmRemoveFile(name)
        }
      } else {
        const groupCount = targets.filter((t) => t instanceof TreeGroupItem).length
        const itemCount = targets.filter((t) => t instanceof TreeFileItem).length
        const parts = [] as string[]
        if (groupCount) parts.push(Message.Format.groupCount(groupCount))
        if (itemCount) parts.push(Message.Format.itemCount(itemCount))
        const summary = parts.join(', ') || Message.Format.itemCount(targets.length)
        message = Message.Warning.confirmRemoveMultiple(summary)
      }
      const picked = await vscWindow.showWarningMessage(
        message,
        { modal: true },
        Message.Button.remove(),
        Message.Button.cancel(),
      )
      if (picked !== Message.Button.remove()) return
    }
    const s = this.state
    let changed = false
    const uniqueGroups = Array.from(
      new Map(
        targets
          .filter((t): t is TreeGroupItem => t instanceof TreeGroupItem)
          .map((g) => [g.group.id, g] as const),
      ).values(),
    )
    for (const groupItem of uniqueGroups) {
      if (this.removeGroupById(s.groups, groupItem.group.id)) {
        changed = true
      }
    }

    const seenFiles = new Set<string>()
    for (const fileItem of targets.filter((t): t is TreeFileItem => t instanceof TreeFileItem)) {
      const groupId = fileItem.groupId
      if (!groupId) continue
      const key = `${groupId}|${fileItem.entry.rel}`
      if (seenFiles.has(key)) continue
      seenFiles.add(key)
      const group = this.findGroupById(s.groups, groupId)?.group
      if (!group) continue
      const base = s.meta.basePath
      const before = group.files.length
      group.files = group.files.filter((fe) => !this.isSameRel(fe.rel, fileItem.entry.rel, base))
      if (group.files.length !== before) changed = true
    }

    if (!changed) return
    this.state = s
    this._emitter.fire()
    if (targets.length > 1) {
      vscWindow.showInformationMessage(Message.Info.itemsRemoved(targets.length))
    }
  }

  /** @description Klasör işleme modunu seçme */
  private async pickFolderHandlingMode(
    placeHolder: string,
  ): Promise<FolderHandlingMode | undefined> {
    type ModeItem = QuickPickItem & { value: FolderHandlingMode }
    const items: ModeItem[] = [
      {
        label: Message.Label.addFoldersAsItems(),
        description: Message.Description.keepFoldersSingleEntry(),
        value: 'folders',
      },
      { label: Message.Label.addFirstLevelFiles(), value: 'first' },
      { label: Message.Label.addAllFilesRecursive(), value: 'recursive' },
    ]
    const quickPick = vscWindow.createQuickPick<ModeItem>()
    quickPick.items = items
    quickPick.placeholder = placeHolder
    quickPick.ignoreFocusOut = true
    return await new Promise<FolderHandlingMode | undefined>((resolve) => {
      let resolved = false
      ;(quickPick as any).activeItems = [items[0]]
      quickPick.onDidAccept(() => {
        const selection = quickPick.activeItems[0] ?? items[0]
        resolved = true
        resolve(selection.value)
        quickPick.hide()
      })
      quickPick.onDidHide(() => {
        if (!resolved) resolve(undefined)
        quickPick.dispose()
      })
      quickPick.show()
    })
  }

  updateTitle = (ws?: readonly WorkspaceFolder[]) => {
    const projectName = ws?.[0]?.name
    if (!this._view || !projectName) return EXTENSION_NAME
    this._view.title = EXTENSION_NAME + ' (' + projectName + ')'
  }

  async addFiles(target?: TreeGroupItem) {
    const group = target ?? (await this.pickGroup())
    if (!group) return
    const uris = await vscWindow.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: true,
      openLabel: Message.Dialog.addToGroup(),
    })
    if (!uris) return
    const s = this.state
    const g = this.findGroupById(s.groups, group.group.id)!.group
    const base = s.meta.basePath
    // if any folder present, ask how to handle
    let hasFolder = false
    for (const u of uris) {
      try {
        const st = await vscWorkspace.fs.stat(u)
        if (st.type === FileType.Directory) {
          hasFolder = true
          break
        }
        // eslint-disable-next-line no-empty
      } catch {}
    }
    let mode: FolderHandlingMode = 'folders'
    if (hasFolder) {
      const picked = await this.pickFolderHandlingMode(Message.Placeholder.folderHandling())
      if (!picked) return
      mode = picked
    }
    if (mode === 'folders') {
      for (const u of uris) {
        try {
          const st = await vscWorkspace.fs.stat(u)
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (st.type === FileType.Directory) {
            if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'folder' })
          } else if (st.type === FileType.File) {
            if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'file' })
          }
          // eslint-disable-next-line no-empty
        } catch {}
      }
    } else {
      const fileUris =
        mode === 'recursive'
          ? (await Promise.all(uris.map((u) => collectFilesRecursively(u)))).flat()
          : (await Promise.all(uris.map((u) => collectFilesFirstLevel(u)))).flat()
      for (const u of fileUris) {
        const rel = toRelativeFromFsPath(u.fsPath, base)
        if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'file' })
      }
    }
    this.state = s
    this._emitter.fire(group)
  }

  /** Explorer seçiminden (dosya/klasör) gruba ekleme */
  async addExplorerResourcesToGroup(resource?: Uri, resources?: Uri[]): Promise<void> {
    const selected = (
      resources && resources.length ? resources : resource ? [resource] : []
    ).filter((u) => !!u && u.scheme === 'file') as Uri[]
    if (selected.length === 0) {
      vscWindow.showInformationMessage(Message.Info.explorerSelectionMissing())
      return
    }

    const s = this.state
    let group: Group | undefined
    // Grup seçimi veya yeni grup oluşturma
    const items = [
      { label: Message.Label.quickPickNewGroup(), id: '__new__' },
      ...this.flattenGroups(s.groups).map((g) => ({
        label: g.pathLabel,
        id: g.id,
      })),
    ]
    const picked = await vscWindow.showQuickPick(items, {
      placeHolder: Message.Placeholder.selectGroupForItems(),
    })
    if (!picked) return
    if (picked.id === '__new__') {
      const suggested = this.suggestGroupName(s.groups)
      const name = await vscWindow.showInputBox({
        prompt: Message.Prompt.newGroupName(),
        value: suggested,
      })
      if (name === undefined) return
      const finalName = name.trim() || suggested
      const newG: Group = {
        id: UUID(),
        name: finalName,
        files: [],
        children: [],
        tags: [],
      }
      s.groups.push(newG)
      group = newG
    } else {
      group = this.findGroupById(s.groups, picked.id!)?.group
    }
    if (!group) return

    const base = s.meta.basePath
    // Eğer klasör varsa nasıl ekleneceğini sor
    let hasFolder = false
    for (const u of selected) {
      try {
        const st = await vscWorkspace.fs.stat(u)
        if (st.type === FileType.Directory) {
          hasFolder = true
          break
        }
        // eslint-disable-next-line no-empty
      } catch {}
    }
    let mode: FolderHandlingMode = 'folders'
    if (hasFolder) {
      const picked = await this.pickFolderHandlingMode(Message.Placeholder.folderHandling())
      if (!picked) return
      mode = picked
    } else {
      mode = 'first'
    }

    let added = 0
    if (mode === 'folders') {
      for (const u of selected) {
        try {
          const st = await vscWorkspace.fs.stat(u)
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (st.type === FileType.Directory) {
            if (!this.hasFileRel(group, rel, base)) {
              group.files.push({ rel, kind: 'folder' })
              added++
            }
          } else if (st.type === FileType.File) {
            if (!this.hasFileRel(group, rel, base)) {
              group.files.push({ rel, kind: 'file' })
              added++
            }
          }
          // eslint-disable-next-line no-empty
        } catch {}
      }
    } else {
      const expanded =
        mode === 'recursive'
          ? (await Promise.all(selected.map((u) => collectFilesRecursively(u)))).flat()
          : (await Promise.all(selected.map((u) => collectFilesFirstLevel(u)))).flat()
      for (const u of expanded) {
        const rel = toRelativeFromFsPath(u.fsPath, base)
        if (!this.hasFileRel(group, rel, base)) {
          group.files.push({ rel, kind: 'file' })
          added++
        }
      }
    }

    if (added > 0) {
      this.state = s
      this._emitter.fire()
      vscWindow.showInformationMessage(Message.Info.itemsAddedToGroup(group.name, added))
    } else {
      vscWindow.showInformationMessage(Message.Info.itemsAlreadyInGroup())
    }
  }

  async moveToGroup(fileItem?: TreeFileItem) {
    const targets = this.getFileTargets(fileItem)
    if (targets.length === 0) return
    const target = await this.pickGroup()
    if (!target) return
    const s = this.state
    const dst = this.findGroupById(s.groups, target.group.id)?.group
    if (!dst) return
    const base = s.meta.basePath
    const seen = new Set<string>()
    let moved = 0
    for (const item of targets) {
      const groupId = item.groupId
      if (!groupId) continue
      const key = `${groupId}|${item.entry.rel}`
      if (seen.has(key)) continue
      seen.add(key)
      const src = this.findGroupById(s.groups, groupId)?.group
      if (!src) continue
      const before = src.files.length
      src.files = src.files.filter((f) => !this.isSameRel(f.rel, item.entry.rel, base))
      if (src.files.length === before) continue
      if (!this.hasFileRel(dst, item.entry.rel, base)) {
        dst.files.push(item.entry)
      }
      moved++
    }
    if (!moved) return
    this.state = s
    this._emitter.fire()
    vscWindow.showInformationMessage(Message.Info.itemsMovedToGroup(moved, target.group.name))
  }

  async sortGroup(item: TreeGroupItem): Promise<void> {
    const picked = await vscWindow.showQuickPick(
      [
        { label: Message.Label.sortAlphabetical(), value: 'alphabetical' as const },
        { label: Message.Label.sortByFolder(), value: 'folder' as const },
        { label: Message.Label.sortByFileType(), value: 'fileType' as const },
      ],
      { placeHolder: Message.Placeholder.sortGroup() },
    )
    if (!picked) return
    const mode: 'folder' | 'fileType' | 'alphabetical' = picked.value

    const s = this.state
    const g = this.findGroupById(s.groups, item.group.id)?.group
    if (!g) return
    const base = s.meta.basePath
    const key = (rel: string): string => {
      const abs = base ? path.join(base, rel) : rel
      if (mode === 'fileType') return (path.extname(abs) || '').toLowerCase()
      if (mode === 'alphabetical') return path.basename(abs).toLowerCase()
      return labelForTopFolder(abs).toLowerCase()
    }
    g.files.sort((a, b) => key(a.rel).localeCompare(key(b.rel)))
    this.state = s
    this._emitter.fire(item)
  }

  async setGroupFilter(): Promise<void> {
    const filter = await vscWindow.showInputBox({
      value: this._groupFilter,
      placeHolder: Message.Placeholder.filterGroups(),
      prompt: Message.Prompt.filterGroups(),
    })
    if (filter === undefined) return
    const trimmed = filter.trim()
    this._groupFilter = trimmed === '' ? undefined : trimmed
    void this.updateFilterContext()
    this.refresh()
  }

  async clearGroupFilter(): Promise<void> {
    this._groupFilter = undefined
    this._tagFilter = undefined
    void this.updateFilterContext()
    this.refresh()
  }

  async applyTagFilter(tag: string): Promise<void> {
    if (!tag) return
    if (this.isSameTag(tag, this._tagFilter)) {
      await this.clearTagFilter()
      return
    }
    this._tagFilter = tag
    void this.updateFilterContext()
    this.refresh()
  }

  async clearTagFilter(): Promise<void> {
    if (!this._tagFilter) return
    this._tagFilter = undefined
    void this.updateFilterContext()
    this.refresh()
  }

  private async updateFilterContext(): Promise<void> {
    const hasFilter = !!(
      (this._groupFilter && this._groupFilter.trim()) ||
      (this._tagFilter && this._tagFilter.trim())
    )
    await vscCmds.executeCommand('setContext', makeCommandId('hasFilter'), hasFilter)
    await vscCmds.executeCommand('setContext', makeCommandId('activeTag'), this._tagFilter ?? null)
  }

  async changeGroupIcon(item?: TreeGroupItem): Promise<void> {
    const targets = this.getGroupTargets(item)
    if (targets.length === 0) return

    const items = [
      { label: Message.Label.defaultIcon(), id: '__default__' },
      { label: Message.Label.noIcon(), id: '__none__' },
      ...symbols.map((id) => ({ label: `$(${id}) ${id}`, id })),
    ]

    const picked = await vscWindow.showQuickPick(items, {
      placeHolder:
        targets.length > 1
          ? Message.Placeholder.bulkGroupIcon()
          : Message.Placeholder.singleGroupIcon(),
    })
    if (!picked) return
    const s = this.state
    let changed = false
    for (const target of targets) {
      const g = this.findGroupById(s.groups, target.group.id)?.group
      if (!g) continue
      if (picked.id === '__default__') {
        if (g.iconId !== undefined) {
          delete g.iconId
          changed = true
        }
      } else if (g.iconId !== picked.id) {
        g.iconId = picked.id
        changed = true
      }
    }
    if (!changed) return
    this.state = s
    this._emitter.fire()
    if (targets.length > 1) {
      vscWindow.showInformationMessage(Message.Info.groupIconsUpdated(targets.length))
    }
  }

  async changeGroupColor(item?: TreeGroupItem): Promise<void> {
    const targets = this.getGroupTargets(item)
    if (targets.length === 0) return
    const extra = vscWorkspace
      .getConfiguration(EXTENSION_ID)
      .get<string[]>('extraColors', [])
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim())

    const items = [
      { label: Message.Label.defaultColor(), value: '__default__' },
      ...extra.map((v) => ({ label: v, value: v })),
      ...defaultPalette,
      { label: Message.Label.customHex(), value: '__custom_hex__' },
    ]
    const picked = await vscWindow.showQuickPick(items, {
      placeHolder:
        targets.length > 1
          ? Message.Placeholder.selectColorMultiple()
          : Message.Placeholder.selectColorSingle(),
    })
    if (!picked) return
    let resolved: string | null
    const s = this.state
    if (picked.value === '__default__') {
      resolved = null
    } else if (picked.value === '__custom_hex__') {
      const hexInput = await vscWindow.showInputBox({
        prompt: Message.Prompt.hexColor(),
        placeHolder: Message.Placeholder.hexInput(),
        validateInput: (v) =>
          /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v.trim())
            ? undefined
            : Message.Validation.hexInvalid(),
      })
      if (!hexInput) return
      const hex = this.normalizeHex(hexInput)
      const token = await this.ensureThemeTokenForHex(hex)
      if (!token) return
      resolved = token
    } else if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(picked.value)) {
      const hex = this.normalizeHex(picked.value)
      const token = await this.ensureThemeTokenForHex(hex)
      if (!token) return
      resolved = token
    } else {
      resolved = picked.value
    }

    let changed = false
    for (const target of targets) {
      const g = this.findGroupById(s.groups, target.group.id)?.group
      if (!g) continue
      if (resolved === null) {
        if (g.colorName !== undefined) {
          delete g.colorName
          changed = true
        }
      } else if (g.colorName !== resolved) {
        g.colorName = resolved
        changed = true
      }
    }
    if (!changed) return
    this.state = s
    this._emitter.fire()
    if (targets.length > 1) {
      vscWindow.showInformationMessage(Message.Info.groupColorsUpdated(targets.length))
    }
  }

  /** Convert #RGB to #RRGGBB and uppercase */
  private normalizeHex(v: string): string {
    const t = v.trim()
    if (/^#[0-9a-fA-F]{3}$/.test(t)) {
      const r = t[1],
        g = t[2],
        b = t[3]
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }
    return t.toUpperCase()
  }

  /** Map hex to a custom theming color token via workbench.colorCustomizations */
  private async ensureThemeTokenForHex(hex: string): Promise<string | undefined> {
    const tokenPool = Array.from({ length: 10 }, (_, i) => `${EXTENSION_ID}.color.custom${i + 1}`)
    const config = vscWorkspace.getConfiguration()
    const current = config.get<any>('workbench.colorCustomizations') || {}
    for (const t of tokenPool) {
      if (
        typeof current[t] === 'string' &&
        String(current[t]).toUpperCase() === hex.toUpperCase()
      ) {
        return t
      }
    }
    const free = tokenPool.find((t) => !current[t]) ?? tokenPool[tokenPool.length - 1]
    const next = { ...current, [free]: hex }
    try {
      await config.update('workbench.colorCustomizations', next, ConfigurationTarget.Workspace)
      return free
    } catch {
      vscWindow.showErrorMessage(Message.Error.applyHexFailed())
      return undefined
    }
  }

  private async revealGroupById(id: string): Promise<void> {
    if (!this._view) return
    const findIn = async (items: TreeItem[]): Promise<TreeGroupItem | undefined> => {
      for (const it of items) {
        if (it instanceof TreeGroupItem && it.group.id === id) return it
        if (it instanceof TreeGroupItem) {
          const kids = (await this.getChildren(it)) || []
          const found = await findIn(kids)
          if (found) return found
        }
      }
      return undefined
    }
    const roots = (await this.getChildren()) || []
    const target = await findIn(roots)
    if (target) {
      try {
        await this._view.reveal(target, {
          select: true,
          focus: true,
          expand: true,
        })
        // eslint-disable-next-line no-empty
      } catch {}
    }
  }

  async exportGroupsToFile(): Promise<void> {
    const defaultPath = vscWorkspace.workspaceFolders?.[0]?.uri.fsPath
    const uri = await vscWindow.showSaveDialog({
      defaultUri: defaultPath
        ? Uri.file(path.join(defaultPath, `${EXTENSION_ID}-export.json`))
        : undefined,
      filters: { json: ['json'] },
      saveLabel: Message.Dialog.exportSaveLabel(),
    })
    if (!uri) return
    const content = JSON.stringify(this.state, null, 2)
    await vscWorkspace.fs.writeFile(uri, DataProvider.encoder.encode(content))
    vscWindow.showInformationMessage(Message.Info.groupsExported())
  }

  async importGroupsFromFile(): Promise<void> {
    const picked = await vscWindow.showOpenDialog({
      canSelectMany: false,
      filters: { json: ['json'] },
      openLabel: Message.Dialog.importOpenLabel(),
    })
    const uri = picked?.[0]
    if (!uri) return
    try {
      const buf = await vscWorkspace.fs.readFile(uri)
      const text = new TextDecoder('utf-8').decode(buf)
      const data = JSON.parse(text) as Partial<State>
      const imported = ensureStateWithMeta(data)
      const s = this.state
      // clone and re-id groups to avoid collisions
      const reId = (g: Group): Group => ({
        id: UUID(),
        name: g.name,
        files: [...(g.files ?? [])],
        children: (g.children ?? []).map(reId),
        iconId: g.iconId,
        colorName: g.colorName,
      })
      for (const g of imported.groups) s.groups.push(reId(g))
      this.state = s
      this._emitter.fire()
      vscWindow.showInformationMessage(Message.Info.groupsImported())
    } catch {
      vscWindow.showErrorMessage(Message.Error.importInvalid())
    }
  }

  private async pickGroup(): Promise<TreeGroupItem | undefined> {
    const groups = this.state.groups
    if (groups.length === 0) {
      vscWindow.showInformationMessage(Message.Info.addGroupFirst())
      return
    }
    const flat = this.flattenGroups(groups)
    const picked = await vscWindow.showQuickPick(
      flat.map((g) => ({ label: g.pathLabel, id: g.id })),
    )
    if (!picked) return
    const found = this.findGroupById(groups, picked.id)!.group
    return new TreeGroupItem(found)
  }

  async editFileAliasDescription(item: TreeFileItem) {
    const s = this.state
    const g = this.findGroupById(s.groups, item.groupId!)?.group
    if (!g) return
    const fe = g.files.find((x) => x.rel === item.entry.rel)
    if (!fe) return
    const name = await vscWindow.showInputBox({
      prompt: Message.Prompt.aliasOptional(),
      value: fe.name ?? '',
      placeHolder: item.entry.rel,
    })
    if (name === undefined) return
    const description = await vscWindow.showInputBox({
      prompt: Message.Prompt.descriptionOptional(),
      value: fe.description ?? '',
    })
    if (description === undefined) return
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    fe.name = trimmedName ? trimmedName : undefined
    fe.description = trimmedDescription ? trimmedDescription : undefined
    this.state = s
    this._emitter.fire(item)
  }

  async editFileTags(item: TreeFileItem): Promise<void> {
    const s = this.state
    const g = this.findGroupById(s.groups, item.groupId!)?.group
    if (!g) return
    const fe = g.files.find((x) => x.rel === item.entry.rel)
    if (!fe) return
    const value = await vscWindow.showInputBox({
      prompt: Message.Prompt.fileTags(),
      placeHolder: Message.Placeholder.fileTags(),
      value: (fe.tags ?? []).join(', '),
    })
    if (value === undefined) return
    const parts = value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const normalized = normalizeTags(parts)
    fe.tags = normalized.length ? normalized : undefined
    this.state = s
    this._emitter.fire(item)
    void this.updateFilterContext()
  }

  // --- Drag & Drop ---
  handleDrag(source: readonly TreeItem[], dataTransfer: DataTransfer): void | Thenable<void> {
    const filePayload = source
      .filter((i): i is TreeFileItem => i instanceof TreeFileItem)
      .map((i) => ({
        type: 'file' as const,
        rel: i.entry.rel,
        from: i.groupId!,
        kind: i.entry.kind || 'file',
      }))
    const groupPayload = source
      .filter((i): i is TreeGroupItem => i instanceof TreeGroupItem)
      .map((i) => ({ type: 'group' as const, id: i.group.id }))
    const payload = [...filePayload, ...groupPayload]
    if (payload.length > 0) {
      dataTransfer.set(
        `application/vnd.code.tree.${VIEW_ID}`,
        new DataTransferItem(JSON.stringify(payload)),
      )
    }
  }

  async handleDrop(target: TreeItem | undefined, dataTransfer: DataTransfer): Promise<void> {
    if (target && !(target instanceof TreeGroupItem) && !(target instanceof TreeFileItem)) {
      return
    }
    // 1) Önceliği dahili payload'a ver (ağaç içi taşıma). Bu sayede
    //    resourceUri nedeniyle gelen 'text/uri-list' iç sürükle-bırakları gölgelemez.
    const internal = dataTransfer.get(`application/vnd.code.tree.${VIEW_ID}`)
    if (internal && target) {
      try {
        const moved = JSON.parse(await internal.asString()) as Array<
          | {
              type: 'file'
              rel: string
              from: string
              kind?: 'file' | 'folder'
            }
          | { type: 'group'; id: string }
        >
        const s = this.state
        const toGroupId =
          target instanceof TreeGroupItem ? target.group.id : (target as TreeFileItem).groupId!
        const toGroup = this.findGroupById(s.groups, toGroupId)?.group
        if (!toGroup) return
        for (const m of moved) {
          if (m.type === 'file') {
            const fromGroup = this.findGroupById(s.groups, m.from)?.group
            if (fromGroup) {
              fromGroup.files = fromGroup.files.filter(
                (u) => !this.isSameRel(u.rel, m.rel, s.meta.basePath),
              )
            }
            if (!this.hasFileRel(toGroup, m.rel, s.meta.basePath))
              toGroup.files.push({ rel: m.rel, kind: m.kind || 'file' })
          } else if (m.type === 'group' && target instanceof TreeGroupItem) {
            if (m.id === toGroup.id) continue
            if (this.isAncestor(s.groups, m.id, toGroup.id)) continue
            const movedGroup = this.detachGroupById(s.groups, m.id)
            if (movedGroup) {
              ;(toGroup.children ?? (toGroup.children = [])).push(movedGroup)
            }
          }
        }
        this.state = s
        this._emitter.fire()
        return
      } catch {
        /* yut */
      }
    }

    // 2) Dışarıdan (Explorer vb.) gelen URI listelerini işle
    const uriList = dataTransfer.get('text/uri-list')
    if (uriList && target instanceof TreeGroupItem) {
      const list = (await uriList.asString()).split(/\r?\n/).filter(Boolean)
      const s = this.state
      const g = this.findGroupById(s.groups, target.group.id)!.group
      const base = s.meta.basePath
      const uris: Uri[] = []
      for (const raw of list) {
        try {
          uris.push(Uri.parse(raw))
        } catch {
          /* yut */
        }
      }
      // Inspect for folders
      let hasFolder = false
      for (const u of uris) {
        try {
          const st = await vscWorkspace.fs.stat(u)
          if (st.type === FileType.Directory) {
            hasFolder = true
            break
          }
          // eslint-disable-next-line no-empty
        } catch {}
      }
      let mode: FolderHandlingMode = 'folders'
      if (hasFolder) {
        const picked = await this.pickFolderHandlingMode(Message.Placeholder.folderHandling())
        if (!picked) return
        mode = picked
      }
      if (mode === 'folders') {
        for (const u of uris) {
          try {
            const st = await vscWorkspace.fs.stat(u)
            const rel = toRelativeFromFsPath(u.fsPath, base)
            if (st.type === FileType.Directory) {
              if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'folder' })
            } else if (st.type === FileType.File) {
              if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'file' })
            }
            // eslint-disable-next-line no-empty
          } catch {}
        }
      } else {
        const expanded =
          mode === 'recursive'
            ? (await Promise.all(uris.map((u) => collectFilesRecursively(u)))).flat()
            : (await Promise.all(uris.map((u) => collectFilesFirstLevel(u)))).flat()
        for (const u of expanded) {
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: 'file' })
        }
      }
      this.state = s
      this._emitter.fire(target)
      return
    }
  }

  private findGroupById(groups: Group[], id: string): { group: Group; parent?: Group } | undefined {
    const stack: { node: Group; parent?: Group }[] = groups.map((g) => ({
      node: g,
    }))
    while (stack.length) {
      const { node, parent } = stack.shift()!
      if (node.id === id) return { group: node, parent }
      for (const c of node.children ?? []) stack.push({ node: c, parent: node })
    }
    return undefined
  }

  private removeGroupById(groups: Group[], id: string): boolean {
    const idx = groups.findIndex((g) => g.id === id)
    if (idx !== -1) {
      groups.splice(idx, 1)
      return true
    }
    for (const g of groups) {
      if (g.children && this.removeGroupById(g.children, id)) return true
    }
    return false
  }

  private detachGroupById(groups: Group[], id: string): Group | undefined {
    const idx = groups.findIndex((g) => g.id === id)
    if (idx !== -1) {
      const [g] = groups.splice(idx, 1)
      return g
    }
    for (const g of groups) {
      if (g.children) {
        const found = this.detachGroupById(g.children, id)
        if (found) return found
      }
    }
    return undefined
  }

  private isSameRel(a: string, b: string, base: string): boolean {
    const ua = fromRelativeToUri(a, base)
    const ub = fromRelativeToUri(b, base)
    return toPosix(ua.fsPath).toLowerCase() === toPosix(ub.fsPath).toLowerCase()
  }

  private hasFileRel(g: Group, rel: string, base: string): boolean {
    return (g.files ?? []).some((fe) => this.isSameRel(fe.rel, rel, base))
  }

  private isAncestor(groups: Group[], ancestorId: string, nodeId: string): boolean {
    const ancestor = this.findGroupById(groups, ancestorId)?.group
    if (!ancestor) return false
    const stack = [...(ancestor.children ?? [])]
    while (stack.length) {
      const n = stack.pop()!
      if (n.id === nodeId) return true
      if (n.children) stack.push(...n.children)
    }
    return false
  }

  private flattenGroups(groups: Group[], prefix = ''): { id: string; pathLabel: string }[] {
    const out: { id: string; pathLabel: string }[] = []
    for (const g of groups) {
      const label = prefix ? `${prefix}/${g.name}` : g.name
      out.push({ id: g.id, pathLabel: label })
      if (g.children && g.children.length) {
        out.push(...this.flattenGroups(g.children, label))
      }
    }
    return out
  }

  /** Aynı seviyedeki kardeş gruplara göre benzersiz bir ad önerir. */
  private suggestGroupName(siblings: Group[]): string {
    const base = Message.Defaults.groupBaseName()
    const names = new Set((siblings || []).map((g) => (g.name || '').trim()))
    if (!names.has(base)) return base
    for (let i = 1; i < 1000; i++) {
      const candidate = `${base}.${String(i).padStart(3, '0')}`
      if (!names.has(candidate)) return candidate
    }
    // fallback (çok sıra dışı durum)
    return `${base}.${Date.now()}`
  }
}
