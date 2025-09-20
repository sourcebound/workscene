import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import FileEntry from '@type/file-entry'
import TreeItemKind from '../enumeration/tree-item-kind'
import * as Message from '@lib/message'

export class TreeFileItem extends TreeItem {
  kind: TreeItemKind.File = TreeItemKind.File
  constructor(
    public readonly uri: vscode.Uri,
    groupId: string,
    public readonly entry: FileEntry,
  ) {
    super(entry.name ?? entry.rel, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'file'
    this.resourceUri = uri
    this.groupId = groupId
    const tags = Array.isArray(entry.tags) ? entry.tags : []
    const parts: string[] = []
    if (entry.description && entry.description.trim()) {
      parts.push(entry.description.trim())
    }
    if (tags.length) {
      parts.push(tags.map((t) => `#${t}`).join(', '))
    }
    if (parts.length) {
      this.description = parts.join(' • ')
      const tooltip = new vscode.MarkdownString(undefined, true)
      if (entry.description && entry.description.trim()) {
        tooltip.appendMarkdown(
          `${Message.Group.tooltipDescriptionLabel()} ${entry.description.trim()}`,
        )
        if (tags.length) tooltip.appendMarkdown('\n\n')
      }
      if (tags.length) {
        tooltip.appendMarkdown(
          `${Message.Group.tooltipTagsLabel()} ${tags.map((t) => `\`#${t}\``).join(' ')}`,
        )
      }
      if (tooltip.value) this.tooltip = tooltip
    }
    if (entry.kind === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder')
      this.command = undefined
    } else {
      this.command = {
        command: 'vscode.open',
        title: Message.File.openCommandTitle(),
        arguments: [uri],
      }
    }
  }
}
