import * as path from "path"
import * as vscode from "vscode"
import { v4 as UUID } from "uuid"
import { TextDecoder, TextEncoder } from "util"

import State from "@type/state"
import Group from "@type/group"
import TreeItem from "@model/tree-item"
import FileEntry from "@type/file-entry"
import FolderHandlingMode from "@type/folder-handling"
import { CONFIG_FILE_BASENAME, VIEW_ID } from "@lib/constants"
import {
  collectFilesRecursively,
  collectFilesFirstLevel,
  labelForTopFolder,
  toPosix,
  toRelativeFromFsPath,
  fromRelativeToUri,
} from "@util/collect-files"

import { productIcons } from "@lib/icon"
import { twColorsHex } from "@lib/color"
import { TreeTagClearItem } from "@model/tree-tag-clear-item"
import { TreeTagItem } from "@model/tree-tag-item"
import { TreeGroupItem } from "@model/tree-group-item"
import { TreeFileItem } from "@model/tree-file-item"
import { TreeTagGroupItem } from "@model/tree-tag-group-item"
import { getDefaultMeta } from "@util/meta"
import { getGroupChildrenItems } from "@util/helper"
import { ensureStateWithMeta, normalizeTags } from "../util/normalize"
import { makeCommandId } from "@lib/constants"
class Provider
  implements
    vscode.TreeDataProvider<TreeItem>,
    vscode.TreeDragAndDropController<TreeItem>
{
  readonly dropMimeTypes = [
    "application/vnd.code.tree.worksceneView",
    "text/uri-list",
  ]

  readonly dragMimeTypes = ["application/vnd.code.tree.worksceneView"]

  private _emitter = new vscode.EventEmitter<TreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._emitter.event

  private _state: State = ensureStateWithMeta({ groups: [] } as any)
  private _loaded = false
  private _saveTimer: ReturnType<typeof setTimeout> | undefined
  private _contextTimer: ReturnType<typeof setTimeout> | undefined
  private _isWriting = false
  private _lastSavedSignature: string = ""
  private _groupFilter: string | undefined
  private _tagFilter: string | undefined
  private _recentlyClosed: string[] | null = null
  private _undoCloseTimeout: ReturnType<typeof setTimeout> | undefined
  private readonly out: vscode.OutputChannel
  private static encoder = new TextEncoder()

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.out = vscode.window.createOutputChannel("Workscene")
    void this.init()
  }

  private _view: vscode.TreeView<TreeItem> | undefined
  attachView(view: vscode.TreeView<TreeItem>) {
    this._view = view
  }

  /**
   * Resolve the effective selection for a command. If the view already has a
   * selection, return that while ensuring the primary item is part of it.
   */
  private getSelectedItems(primary?: TreeItem): TreeItem[] {
    const selection = this._view?.selection ?? []
    if (!selection.length && primary) return [primary]
    if (!selection.length) return []
    const set = new Set<TreeItem>()
    for (const it of selection) set.add(it)
    if (primary) set.add(primary)
    return Array.from(set)
  }

  private getGroupTargets(primary?: TreeGroupItem): TreeGroupItem[] {
    const selected = this.getSelectedItems(primary)
    const groups = selected.filter(
      (it): it is TreeGroupItem => it instanceof TreeGroupItem
    )
    if (groups.length === 0 && primary instanceof TreeGroupItem) {
      return [primary]
    }
    return groups
  }

  private getFileTargets(primary?: TreeFileItem): TreeFileItem[] {
    const selected = this.getSelectedItems(primary)
    const files = selected.filter(
      (it): it is TreeFileItem => it instanceof TreeFileItem
    )
    if (files.length === 0 && primary instanceof TreeFileItem) {
      return [primary]
    }
    return files
  }

  private async init(): Promise<void> {
    const u = this.configUri
    if (u) {
      try {
        const content = await vscode.workspace.fs.readFile(u)
        const text = new TextDecoder("utf-8").decode(content)
        const parsed = JSON.parse(text) as Partial<State>
        this._state = ensureStateWithMeta(parsed)
      } catch {
        this._state = ensureStateWithMeta({ groups: [] } as any)
      }
    }
    this._lastSavedSignature = this.computeSignature(this._state)
    void vscode.commands.executeCommand(
      "setContext",
      makeCommandId("canSave"),
      false
    )
    this._loaded = true
    this.refresh()
    void this.updateFilterContext()
  }

  private get state(): State {
    return this._state
  }
  private set state(v: State) {
    const basePath = getDefaultMeta().basePath
    const now = new Date().toISOString()
    // v'nin zaten normalize olduğunu varsayıp meta'yı güncelle
    const next: State = {
      meta: {
        basePath,
        createdAt: this._state.meta?.createdAt || now,
        updatedAt: now,
        version:
          typeof this._state.meta?.version === "number"
            ? this._state.meta.version
            : 1,
      },
      groups: v.groups,
    }
    this._state = next
    this.scheduleSave()
    this.scheduleCanSaveContextUpdate()
  }

  private get configUri(): vscode.Uri | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0]
    if (!ws) return undefined
    return vscode.Uri.joinPath(ws.uri, CONFIG_FILE_BASENAME)
  }

  private scheduleSave(): void {
    if (!this._loaded) return
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      void this.saveToDisk()
    }, 200)
  }

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
    const bytes = Provider.encoder.encode(JSON.stringify(toWrite, null, 2))
    try {
      this._isWriting = true
      await vscode.workspace.fs.writeFile(u, bytes)
    } catch {
      try {
        await vscode.workspace.fs.writeFile(u, bytes)
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
      this.out.appendLine(
        `[workscene] saveToDisk: ${elapsed}ms, size=${bytes.byteLength} bytes`
      )
    }
  }

  /** Manuel kaydet: bekleyen yazmayı iptal et, değişiklik yoksa yazma */
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

  /** Dışarıdan yükleme sonrası imzayı senkronize eder */
  syncSavedSignatureWithState(): void {
    this._lastSavedSignature = this.computeSignature(this._state)
    void this.updateCanSaveContext()
  }

  /** Yalnızca anlamlı alanlardan deterministik imza üretir (timestamp hariç) */
  private computeSignature(state: State): string {
    const simplifyGroup = (g: Group): any => {
      const children = (g.children ?? []).map(simplifyGroup)
      children.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      const files = (g.files ?? []).map((fe) => ({
        rel: fe.rel || "",
        name: fe.name || "",
        description: fe.description || "",
        kind: fe.kind || "file",
      }))
      files.sort((a, b) =>
        (
          a.rel +
          "\u0000" +
          a.name +
          "\u0000" +
          a.description +
          "\u0000" +
          a.kind
        ).localeCompare(
          b.rel +
            "\u0000" +
            b.name +
            "\u0000" +
            b.description +
            "\u0000" +
            b.kind
        )
      )
      return {
        id: g.id,
        name: g.name,
        iconId: g.iconId || "",
        colorName: g.colorName || "",
        files,
        children,
      }
    }
    const groups = (state.groups ?? []).map(simplifyGroup)
    groups.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    const simplified = {
      basePath: state.meta.basePath,
      version: state.meta.version,
      groups,
    }
    return JSON.stringify(simplified)
  }

  /** UI context güncellemesini debounce ederek CPU yükünü azalt */
  private scheduleCanSaveContextUpdate(): void {
    if (this._contextTimer) clearTimeout(this._contextTimer)
    this._contextTimer = setTimeout(() => {
      void this.updateCanSaveContext()
    }, 150)
  }

  private async updateCanSaveContext(): Promise<void> {
    const current = this.computeSignature(this._state)
    const canSave = current !== this._lastSavedSignature
    await vscode.commands.executeCommand(
      "setContext",
      makeCommandId("canSave"),
      canSave
    )
  }

  refresh() {
    this._emitter.fire()
  }
  getTreeItem(el: TreeItem) {
    return el
  }

  getChildren(el?: TreeItem): vscode.ProviderResult<TreeItem[]> {
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
        items.push(
          new TreeTagItem(
            info.tag,
            info.count,
            this.isSameTag(info.tag, this._tagFilter)
          )
        )
      }
      return items
    }
    if (el instanceof TreeTagItem || el instanceof TreeTagClearItem) {
      return []
    }
    if (el instanceof TreeGroupItem)
      return getGroupChildrenItems(el.group, s.meta.basePath)
    return []
  }

  getParent(el: TreeItem): vscode.ProviderResult<TreeItem> {
    const s = this.state
    if (el instanceof TreeTagItem || el instanceof TreeTagClearItem) {
      return this.buildTagGroupItem() ?? null
    }
    if (el instanceof TreeTagGroupItem) return null
    if (el instanceof TreeFileItem) {
      const group = this.findGroupById(s.groups, el.groupId || "")?.group
      return group ? new TreeGroupItem(group) : null
    }
    if (el instanceof TreeGroupItem) {
      const found = this.findGroupById(s.groups, el.group.id)
      const parent = found?.parent
      return parent ? new TreeGroupItem(parent) : null
    }
    return null
  }

  private buildTagGroupItem(): TreeTagGroupItem | undefined {
    const stats = this.getTagStats()
    if (!stats.length && !this._tagFilter) return undefined
    return new TreeTagGroupItem(stats, this._tagFilter)
  }

  private getFilteredRootGroups(groups: Group[]): Group[] {
    let results = groups
    if (this._tagFilter) {
      results = results.filter((g) => this.groupMatchesTag(g, this._tagFilter!))
    }
    if (this._groupFilter) {
      const needle = this._groupFilter.toLowerCase()
      results = results.filter((g) =>
        (g.name || "").toLowerCase().includes(needle)
      )
    }
    return results
  }

  private getTagStats(): Array<{ tag: string; count: number }> {
    const stats = new Map<string, { tag: string; count: number }>()
    const visit = (nodes: Group[]) => {
      for (const g of nodes) {
        for (const tag of g.tags ?? []) {
          const key = tag.toLowerCase()
          const existing = stats.get(key)
          if (existing) existing.count += 1
          else stats.set(key, { tag, count: 1 })
        }
        if (g.children?.length) visit(g.children)
      }
    }
    visit(this.state.groups)
    return Array.from(stats.values()).sort((a, b) => a.tag.localeCompare(b.tag))
  }

  private groupMatchesTag(group: Group, tag: string): boolean {
    if ((group.tags ?? []).some((t) => this.isSameTag(t, tag))) return true
    for (const child of group.children ?? []) {
      if (this.groupMatchesTag(child, tag)) return true
    }
    return false
  }

  private isSameTag(a: string, b: string | undefined): boolean {
    if (!b) return false
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }

  /** Aktif editör sekmelerindeki tüm dosyaları belirtilen gruba ekler veya seçim ister */
  async addOpenTabsToGroup(target?: TreeGroupItem): Promise<void> {
    const filePaths = this.getOpenEditorFilePaths()
    if (filePaths.length === 0) {
      vscode.window.showInformationMessage("Açık dosya sekmesi bulunamadı.")
      return
    }
    const s = this.state
    const base = s.meta.basePath
    const rels = filePaths
      .map((p) => toRelativeFromFsPath(p, base))
      .filter(Boolean)

    let group: Group | undefined
    if (target) {
      group = this.findGroupById(s.groups, target.group.id)?.group
    } else {
      // Grup seçimi veya yeni grup oluşturma
      const items = [
        { label: "$(new-folder) Yeni Grup...", id: "__new__" },
        ...this.flattenGroups(s.groups).map((g) => ({
          label: g.pathLabel,
          id: g.id,
        })),
      ]
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Sekmeleri eklenecek grubu seçin",
      })
      if (!picked) return
      if (picked.id === "__new__") {
        const suggested = this.suggestGroupName(s.groups)
        const name = await vscode.window.showInputBox({
          prompt: "Yeni grup adı",
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
        group.files.push({ rel, kind: "file" })
        added++
      }
    }
    if (added > 0) {
      this.state = s
      this._emitter.fire(target)
    }
    vscode.window.showInformationMessage(
      `${group.name} grubuna ${added} sekme eklendi.`
    )
  }

  /** Bir gruptaki tüm dosyaları editörde açar (varsa mevcut sekmeyi öne çıkarır) */
  async openAllInGroup(item: TreeGroupItem): Promise<void> {
    const s = this.state
    const base = s.meta.basePath
    const entries = item.group.files ?? []
    const fileEntries = entries.filter((fe) => (fe.kind ?? "file") !== "folder")
    if (fileEntries.length === 0) {
      vscode.window.showInformationMessage("Bu grupta açılacak dosya yok.")
      return
    }
    const skippedFolders = entries.length - fileEntries.length
    const autoClose = vscode.workspace
      .getConfiguration("workscene")
      .get<boolean>("autoCloseOnOpenAll", false)
    if (autoClose) {
      this._recentlyClosed = this.getOpenEditorFilePaths()
      await vscode.commands.executeCommand(
        "setContext",
        "workscene.canUndoClose",
        true
      )
      if (this._undoCloseTimeout) clearTimeout(this._undoCloseTimeout)
      this._undoCloseTimeout = setTimeout(async () => {
        this._recentlyClosed = null
        await vscode.commands.executeCommand(
          "setContext",
          "workscene.canUndoClose",
          false
        )
      }, 5000)
      await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    }
    for (let i = 0; i < fileEntries.length; i++) {
      const fe = fileEntries[i]
      const uri = fromRelativeToUri(fe.rel, base)
      try {
        if (await this.revealExistingTab(uri)) continue
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: i !== 0,
        })
      } catch {
        // dosya açılamazsa yut ve devam et
      }
    }
    if (skippedFolders > 0) {
      vscode.window.showInformationMessage(
        `${skippedFolders} klasör atlandı. Bu komut yalnızca dosyaları açar.`
      )
    }
  }

  async undoCloseEditors(): Promise<void> {
    if (!this._recentlyClosed || this._recentlyClosed.length === 0) return
    for (const p of this._recentlyClosed) {
      try {
        const uri = vscode.Uri.file(p)
        if (await this.revealExistingTab(uri)) continue
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: false })
      } catch {
        /* yut */
      }
    }
    this._recentlyClosed = null
    if (this._undoCloseTimeout) clearTimeout(this._undoCloseTimeout)
    await vscode.commands.executeCommand(
      "setContext",
      "workscene.canUndoClose",
      false
    )
    vscode.window.showInformationMessage("Kapatılan sekmeler geri yüklendi.")
  }

  /** Açık sekmeler arasında verilen URI'yi bulup ilgili grupta öne çıkarır */
  private async revealExistingTab(uri: vscode.Uri): Promise<boolean> {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input: any = (tab as any).input
        if (!input || typeof input !== "object" || !("uri" in input)) continue
        const tabUri = input.uri
        if (tabUri instanceof vscode.Uri && tabUri.fsPath === uri.fsPath) {
          const document = await vscode.workspace.openTextDocument(uri)
          await vscode.window.showTextDocument(document, {
            viewColumn: group.viewColumn,
            preview: false,
          })
          return true
        }
      }
    }
    return false
  }

  /** Aktif editor gruplarındaki tüm açık dosya yollarını toplar (file:// olanlar) */
  private getOpenEditorFilePaths(): string[] {
    const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs)
    const out: string[] = []
    for (const tab of allTabs) {
      const input: any = (tab as any).input
      if (input && typeof input === "object" && "uri" in input) {
        const uri: any = input.uri
        if (uri instanceof vscode.Uri && uri.scheme === "file") {
          out.push(uri.fsPath)
        }
      }
    }
    return out
  }

  async addGroup(target?: TreeGroupItem) {
    const s = this.state
    const siblings = target
      ? this.findGroupById(s.groups, target.group.id)?.group.children ?? []
      : s.groups
    const suggested = this.suggestGroupName(siblings)
    const name = await vscode.window.showInputBox({
      prompt: "Group name",
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

  async addSubGroup(target: TreeGroupItem) {
    return this.addGroup(target)
  }

  async renameGroup(item: TreeGroupItem) {
    const name = await vscode.window.showInputBox({
      prompt: "New name",
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

  async editGroupTags(item: TreeGroupItem): Promise<void> {
    const s = this.state
    const target = this.findGroupById(s.groups, item.group.id)?.group
    if (!target) return
    const current = target.tags ?? []
    const value = await vscode.window.showInputBox({
      prompt: "Group tags (comma separated)",
      placeHolder: "ör. ui, onboarding",
      value: current.join(", "),
    })
    if (value === undefined) return
    const parts = value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const normalized = normalizeTags(parts)
    target.tags = normalized
    this.state = s
    this._emitter.fire(item)
    void this.updateFilterContext()
  }

  async remove(item?: TreeItem) {
    const targets = this.getSelectedItems(item).filter(
      (it): it is TreeGroupItem | TreeFileItem =>
        it instanceof TreeGroupItem || it instanceof TreeFileItem
    )
    if (targets.length === 0) return
    const cfg = vscode.workspace.getConfiguration("workscene")
    const confirm = cfg.get<boolean>("confirmBeforeRemove", true)
    if (confirm) {
      let message: string
      if (targets.length === 1) {
        const single = targets[0]
        if (single instanceof TreeGroupItem) {
          const name = single.group.name
          message = `"${name}" grubu ve alt öğeleri kaldırılacak. Devam edilsin mi?`
        } else {
          const name = single.entry.name || single.entry.rel
          message = `"${name}" gruptan kaldırılacak. Devam edilsin mi?`
        }
      } else {
        const groupCount = targets.filter(
          (t) => t instanceof TreeGroupItem
        ).length
        const itemCount = targets.filter(
          (t) => t instanceof TreeFileItem
        ).length
        const parts = [] as string[]
        if (groupCount) parts.push(`${groupCount} grup`)
        if (itemCount) parts.push(`${itemCount} öğe`)
        const summary = parts.join(", ") || `${targets.length} öğe`
        message = `Seçili ${summary} kaldırılacak. Devam edilsin mi?`
      }
      const picked = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Kaldır",
        "İptal"
      )
      if (picked !== "Kaldır") return
    }
    const s = this.state
    let changed = false
    const uniqueGroups = Array.from(
      new Map(
        targets
          .filter((t): t is TreeGroupItem => t instanceof TreeGroupItem)
          .map((g) => [g.group.id, g] as const)
      ).values()
    )
    for (const groupItem of uniqueGroups) {
      if (this.removeGroupById(s.groups, groupItem.group.id)) {
        changed = true
      }
    }

    const seenFiles = new Set<string>()
    for (const fileItem of targets.filter(
      (t): t is TreeFileItem => t instanceof TreeFileItem
    )) {
      const groupId = fileItem.groupId
      if (!groupId) continue
      const key = `${groupId}|${fileItem.entry.rel}`
      if (seenFiles.has(key)) continue
      seenFiles.add(key)
      const group = this.findGroupById(s.groups, groupId)?.group
      if (!group) continue
      const base = s.meta.basePath
      const before = group.files.length
      group.files = group.files.filter(
        (fe) => !this.isSameRel(fe.rel, fileItem.entry.rel, base)
      )
      if (group.files.length !== before) changed = true
    }

    if (!changed) return
    this.state = s
    this._emitter.fire()
    if (targets.length > 1) {
      vscode.window.showInformationMessage(`${targets.length} öğe kaldırıldı.`)
    }
  }

  private async pickFolderHandlingMode(
    placeHolder: string
  ): Promise<FolderHandlingMode | undefined> {
    type ModeItem = vscode.QuickPickItem & { value: FolderHandlingMode }
    const items: ModeItem[] = [
      {
        label: "Add folders as items",
        description: "Keep folders as single entries",
        value: "folders",
      },
      { label: "Add first-level files only", value: "first" },
      { label: "Add all files recursively", value: "recursive" },
    ]
    const quickPick = vscode.window.createQuickPick<ModeItem>()
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

  async addFiles(target?: TreeGroupItem) {
    const group = target ?? (await this.pickGroup())
    if (!group) return
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: true,
      openLabel: "Add to group",
    })
    if (!uris) return
    const s = this.state
    const g = this.findGroupById(s.groups, group.group.id)!.group
    const base = s.meta.basePath
    // if any folder present, ask how to handle
    let hasFolder = false
    for (const u of uris) {
      try {
        const st = await vscode.workspace.fs.stat(u)
        if (st.type === vscode.FileType.Directory) {
          hasFolder = true
          break
        }
      } catch {}
    }
    let mode: FolderHandlingMode = "folders"
    if (hasFolder) {
      const picked = await this.pickFolderHandlingMode(
        "Select how to add selected folders"
      )
      if (!picked) return
      mode = picked
    }
    if (mode === "folders") {
      for (const u of uris) {
        try {
          const st = await vscode.workspace.fs.stat(u)
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (st.type === vscode.FileType.Directory) {
            if (!this.hasFileRel(g, rel, base))
              g.files.push({ rel, kind: "folder" })
          } else if (st.type === vscode.FileType.File) {
            if (!this.hasFileRel(g, rel, base))
              g.files.push({ rel, kind: "file" })
          }
        } catch {}
      }
    } else {
      const fileUris =
        mode === "recursive"
          ? (
              await Promise.all(uris.map((u) => collectFilesRecursively(u)))
            ).flat()
          : (
              await Promise.all(uris.map((u) => collectFilesFirstLevel(u)))
            ).flat()
      for (const u of fileUris) {
        const rel = toRelativeFromFsPath(u.fsPath, base)
        if (!this.hasFileRel(g, rel, base)) g.files.push({ rel, kind: "file" })
      }
    }
    this.state = s
    this._emitter.fire(group)
  }

  /** Explorer seçiminden (dosya/klasör) gruba ekleme */
  async addExplorerResourcesToGroup(
    resource?: vscode.Uri,
    resources?: vscode.Uri[]
  ): Promise<void> {
    const selected = (
      resources && resources.length ? resources : resource ? [resource] : []
    ).filter((u) => !!u && u.scheme === "file") as vscode.Uri[]
    if (selected.length === 0) {
      vscode.window.showInformationMessage(
        "Explorer'dan bir veya daha fazla öğe seçin."
      )
      return
    }

    const s = this.state
    let group: Group | undefined
    // Grup seçimi veya yeni grup oluşturma
    const items = [
      { label: "$(new-folder) Yeni Grup...", id: "__new__" },
      ...this.flattenGroups(s.groups).map((g) => ({
        label: g.pathLabel,
        id: g.id,
      })),
    ]
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Seçilenleri eklenecek grubu seçin",
    })
    if (!picked) return
    if (picked.id === "__new__") {
      const suggested = this.suggestGroupName(s.groups)
      const name = await vscode.window.showInputBox({
        prompt: "Yeni grup adı",
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
        const st = await vscode.workspace.fs.stat(u)
        if (st.type === vscode.FileType.Directory) {
          hasFolder = true
          break
        }
      } catch {}
    }
    let mode: FolderHandlingMode = "folders"
    if (hasFolder) {
      const picked = await this.pickFolderHandlingMode(
        "Seçilen klasör(ler)i nasıl eklemek istersiniz?"
      )
      if (!picked) return
      mode = picked
    } else {
      mode = "first"
    }

    let added = 0
    if (mode === "folders") {
      for (const u of selected) {
        try {
          const st = await vscode.workspace.fs.stat(u)
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (st.type === vscode.FileType.Directory) {
            if (!this.hasFileRel(group, rel, base)) {
              group.files.push({ rel, kind: "folder" })
              added++
            }
          } else if (st.type === vscode.FileType.File) {
            if (!this.hasFileRel(group, rel, base)) {
              group.files.push({ rel, kind: "file" })
              added++
            }
          }
        } catch {}
      }
    } else {
      const expanded =
        mode === "recursive"
          ? (
              await Promise.all(selected.map((u) => collectFilesRecursively(u)))
            ).flat()
          : (
              await Promise.all(selected.map((u) => collectFilesFirstLevel(u)))
            ).flat()
      for (const u of expanded) {
        const rel = toRelativeFromFsPath(u.fsPath, base)
        if (!this.hasFileRel(group, rel, base)) {
          group.files.push({ rel, kind: "file" })
          added++
        }
      }
    }

    if (added > 0) {
      this.state = s
      this._emitter.fire()
      vscode.window.showInformationMessage(
        `${group.name} grubuna ${added} öğe eklendi.`
      )
    } else {
      vscode.window.showInformationMessage(
        "Seçilen tüm öğeler zaten grupta mevcut."
      )
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
      src.files = src.files.filter(
        (f) => !this.isSameRel(f.rel, item.entry.rel, base)
      )
      if (src.files.length === before) continue
      if (!this.hasFileRel(dst, item.entry.rel, base)) {
        dst.files.push(item.entry)
      }
      moved++
    }
    if (!moved) return
    this.state = s
    this._emitter.fire()
    vscode.window.showInformationMessage(
      `${moved} öğe ${target.group.name} grubuna taşındı.`
    )
  }

  async sortGroup(item: TreeGroupItem): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      ["Sort Alphabetically", "Sort by Folder", "Sort by File Type"],
      { placeHolder: "Sort Group" }
    )
    if (!picked) return
    let mode: "folder" | "fileType" | "alphabetical" = "folder"
    if (picked === "Sort by File Type") mode = "fileType"
    if (picked === "Sort Alphabetically") mode = "alphabetical"

    const s = this.state
    const g = this.findGroupById(s.groups, item.group.id)?.group
    if (!g) return
    const base = s.meta.basePath
    const key = (rel: string): string => {
      const abs = base ? path.join(base, rel) : rel
      if (mode === "fileType") return (path.extname(abs) || "").toLowerCase()
      if (mode === "alphabetical") return path.basename(abs).toLowerCase()
      return labelForTopFolder(abs).toLowerCase()
    }
    g.files.sort((a, b) => key(a.rel).localeCompare(key(b.rel)))
    this.state = s
    this._emitter.fire(item)
  }

  async setGroupFilter(): Promise<void> {
    const filter = await vscode.window.showInputBox({
      value: this._groupFilter,
      placeHolder: "Filter groups by name",
      prompt: "Enter text to filter groups. Leave empty to clear.",
    })
    if (filter === undefined) return
    const trimmed = filter.trim()
    this._groupFilter = trimmed === "" ? undefined : trimmed
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
    await vscode.commands.executeCommand(
      "setContext",
      makeCommandId("hasFilter"),
      hasFilter
    )
    await vscode.commands.executeCommand(
      "setContext",
      makeCommandId("activeTag"),
      this._tagFilter ?? null
    )
  }

  async changeGroupIcon(item?: TreeGroupItem): Promise<void> {
    const targets = this.getGroupTargets(item)
    if (targets.length === 0) return

    const icons = productIcons
    const items = [
      { label: "Default (star)", id: "__default__" },
      { label: "No Icon", id: "__none__" },
      ...icons.map((id) => ({ label: `$(${id}) ${id}`, id })),
    ]

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder:
        targets.length > 1
          ? "Grup simgesi (tüm seçilenler)"
          : "Grup Simgesi...",
    })
    if (!picked) return
    const s = this.state
    let changed = false
    for (const target of targets) {
      const g = this.findGroupById(s.groups, target.group.id)?.group
      if (!g) continue
      if (picked.id === "__default__") {
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
      vscode.window.showInformationMessage(
        `${targets.length} grup simgesi güncellendi.`
      )
    }
  }

  async changeGroupColor(item?: TreeGroupItem): Promise<void> {
    const targets = this.getGroupTargets(item)
    if (targets.length === 0) return
    const extra = vscode.workspace
      .getConfiguration("workscene")
      .get<string[]>("extraColors", [])
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())

    const items = [
      { label: "Default", value: "__default__" },
      ...extra.map((v) => ({ label: v, value: v })),
      ...twColorsHex,
      { label: "Custom Hex…", value: "__custom_hex__" },
    ]
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder:
        targets.length > 1
          ? "Seçili gruplar için renk"
          : "Select a color for this group",
    })
    if (!picked) return
    let resolved: string | null
    const s = this.state
    if (picked.value === "__default__") {
      resolved = null
    } else if (picked.value === "__custom_hex__") {
      const hexInput = await vscode.window.showInputBox({
        prompt: "Hex color (e.g. #FF8800)",
        placeHolder: "#RRGGBB",
        validateInput: (v) =>
          /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v.trim())
            ? undefined
            : "Geçerli bir hex renk girin",
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
      vscode.window.showInformationMessage(
        `${targets.length} grubun rengi güncellendi.`
      )
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
  private async ensureThemeTokenForHex(
    hex: string
  ): Promise<string | undefined> {
    const tokenPool = Array.from(
      { length: 10 },
      (_, i) => `workscene.color.custom${i + 1}`
    )
    const config = vscode.workspace.getConfiguration()
    const current = config.get<any>("workbench.colorCustomizations") || {}
    for (const t of tokenPool) {
      if (
        typeof current[t] === "string" &&
        String(current[t]).toUpperCase() === hex.toUpperCase()
      ) {
        return t
      }
    }
    const free =
      tokenPool.find((t) => !current[t]) ?? tokenPool[tokenPool.length - 1]
    const next = { ...current, [free]: hex }
    try {
      await config.update(
        "workbench.colorCustomizations",
        next,
        vscode.ConfigurationTarget.Workspace
      )
      return free
    } catch {
      vscode.window.showErrorMessage(
        "Hex rengi uygularken ayar güncellenemedi."
      )
      return undefined
    }
  }

  private async revealGroupById(id: string): Promise<void> {
    if (!this._view) return
    const findIn = async (
      items: TreeItem[]
    ): Promise<TreeGroupItem | undefined> => {
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
      } catch {}
    }
  }

  async exportGroupsToFile(): Promise<void> {
    const defaultPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const uri = await vscode.window.showSaveDialog({
      defaultUri: defaultPath
        ? vscode.Uri.file(path.join(defaultPath, "workscene-export.json"))
        : undefined,
      filters: { json: ["json"] },
      saveLabel: "Export Groups",
    })
    if (!uri) return
    const content = JSON.stringify(this.state, null, 2)
    await vscode.workspace.fs.writeFile(uri, Provider.encoder.encode(content))
    vscode.window.showInformationMessage("Groups exported successfully.")
  }

  async importGroupsFromFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { json: ["json"] },
      openLabel: "Import Groups",
    })
    const uri = picked?.[0]
    if (!uri) return
    try {
      const buf = await vscode.workspace.fs.readFile(uri)
      const text = new TextDecoder("utf-8").decode(buf)
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
      vscode.window.showInformationMessage("Groups imported successfully.")
    } catch {
      vscode.window.showErrorMessage("Invalid JSON file. Import failed.")
    }
  }

  private async pickGroup(): Promise<TreeGroupItem | undefined> {
    const groups = this.state.groups
    if (groups.length === 0) {
      vscode.window.showInformationMessage("Önce bir grup ekleyin.")
      return
    }
    const flat = this.flattenGroups(groups)
    const picked = await vscode.window.showQuickPick(
      flat.map((g) => ({ label: g.pathLabel, id: g.id }))
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
    const name = await vscode.window.showInputBox({
      prompt: "Alias (optional)",
      value: fe.name ?? "",
      placeHolder: item.entry.rel,
    })
    if (name === undefined) return
    const description = await vscode.window.showInputBox({
      prompt: "Description (optional)",
      value: fe.description ?? "",
    })
    if (description === undefined) return
    fe.name = name || undefined
    fe.description = description || undefined
    this.state = s
    this._emitter.fire(item)
  }

  // --- Drag & Drop ---
  handleDrag(
    source: readonly TreeItem[],
    dataTransfer: vscode.DataTransfer
  ): void | Thenable<void> {
    const filePayload = source
      .filter((i): i is TreeFileItem => i instanceof TreeFileItem)
      .map((i) => ({
        type: "file" as const,
        rel: i.entry.rel,
        from: i.groupId!,
        kind: i.entry.kind || "file",
      }))
    const groupPayload = source
      .filter((i): i is TreeGroupItem => i instanceof TreeGroupItem)
      .map((i) => ({ type: "group" as const, id: i.group.id }))
    const payload = [...filePayload, ...groupPayload]
    if (payload.length > 0) {
      dataTransfer.set(
        "application/vnd.code.tree.worksceneView",
        new vscode.DataTransferItem(JSON.stringify(payload))
      )
    }
  }

  async handleDrop(
    target: TreeItem | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    if (
      target &&
      !(target instanceof TreeGroupItem) &&
      !(target instanceof TreeFileItem)
    ) {
      return
    }
    // 1) Önceliği dahili payload'a ver (ağaç içi taşıma). Bu sayede
    //    resourceUri nedeniyle gelen "text/uri-list" iç sürükle-bırakları gölgelemez.
    const internal = dataTransfer.get("application/vnd.code.tree.worksceneView")
    if (internal && target) {
      try {
        const moved = JSON.parse(await internal.asString()) as Array<
          | {
              type: "file"
              rel: string
              from: string
              kind?: "file" | "folder"
            }
          | { type: "group"; id: string }
        >
        const s = this.state
        const toGroupId =
          target instanceof TreeGroupItem
            ? target.group.id
            : (target as TreeFileItem).groupId!
        const toGroup = this.findGroupById(s.groups, toGroupId)?.group
        if (!toGroup) return
        for (const m of moved) {
          if (m.type === "file") {
            const fromGroup = this.findGroupById(s.groups, m.from)?.group
            if (fromGroup) {
              fromGroup.files = fromGroup.files.filter(
                (u) => !this.isSameRel(u.rel, m.rel, s.meta.basePath)
              )
            }
            if (!this.hasFileRel(toGroup, m.rel, s.meta.basePath))
              toGroup.files.push({ rel: m.rel, kind: m.kind || "file" })
          } else if (m.type === "group" && target instanceof TreeGroupItem) {
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
    const uriList = dataTransfer.get("text/uri-list")
    if (uriList && target instanceof TreeGroupItem) {
      const list = (await uriList.asString()).split(/\r?\n/).filter(Boolean)
      const s = this.state
      const g = this.findGroupById(s.groups, target.group.id)!.group
      const base = s.meta.basePath
      let uris: vscode.Uri[] = []
      for (const raw of list) {
        try {
          uris.push(vscode.Uri.parse(raw))
        } catch {
          /* yut */
        }
      }
      // Inspect for folders
      let hasFolder = false
      for (const u of uris) {
        try {
          const st = await vscode.workspace.fs.stat(u)
          if (st.type === vscode.FileType.Directory) {
            hasFolder = true
            break
          }
        } catch {}
      }
      let mode: FolderHandlingMode = "folders"
      if (hasFolder) {
        const picked = await this.pickFolderHandlingMode(
          "Select how to add dropped folder(s)"
        )
        if (!picked) return
        mode = picked
      }
      if (mode === "folders") {
        for (const u of uris) {
          try {
            const st = await vscode.workspace.fs.stat(u)
            const rel = toRelativeFromFsPath(u.fsPath, base)
            if (st.type === vscode.FileType.Directory) {
              if (!this.hasFileRel(g, rel, base))
                g.files.push({ rel, kind: "folder" })
            } else if (st.type === vscode.FileType.File) {
              if (!this.hasFileRel(g, rel, base))
                g.files.push({ rel, kind: "file" })
            }
          } catch {}
        }
      } else {
        const expanded =
          mode === "recursive"
            ? (
                await Promise.all(uris.map((u) => collectFilesRecursively(u)))
              ).flat()
            : (
                await Promise.all(uris.map((u) => collectFilesFirstLevel(u)))
              ).flat()
        for (const u of expanded) {
          const rel = toRelativeFromFsPath(u.fsPath, base)
          if (!this.hasFileRel(g, rel, base))
            g.files.push({ rel, kind: "file" })
        }
      }
      this.state = s
      this._emitter.fire(target)
      return
    }
  }

  private findGroupById(
    groups: Group[],
    id: string
  ): { group: Group; parent?: Group } | undefined {
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

  private isAncestor(
    groups: Group[],
    ancestorId: string,
    nodeId: string
  ): boolean {
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

  private flattenGroups(
    groups: Group[],
    prefix = ""
  ): { id: string; pathLabel: string }[] {
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
    const base = "Group"
    const names = new Set((siblings || []).map((g) => (g.name || "").trim()))
    if (!names.has(base)) return base
    for (let i = 1; i < 1000; i++) {
      const candidate = `${base}.${String(i).padStart(3, "0")}`
      if (!names.has(candidate)) return candidate
    }
    // fallback (çok sıra dışı durum)
    return `${base}.${Date.now()}`
  }
}

export default Provider