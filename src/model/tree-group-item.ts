import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import Group from '@type/group'
import TreeItemKind from './tree-item-kind'
export class TreeGroupItem extends TreeItem {
  kind: TreeItemKind.Group = TreeItemKind.Group
  constructor(
    public readonly group: Group,
    _iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
  ) {
    super(group.name, vscode.TreeItemCollapsibleState.Collapsed)
    this.contextValue = 'group'
    const color = group.colorName ? new vscode.ThemeColor(group.colorName) : undefined
    if (group.iconId === '__none__') {
      this.iconPath = undefined
    } else {
      const iconId = group.iconId || 'star'
      this.iconPath = new vscode.ThemeIcon(iconId, color)
    }
    const tags = Array.isArray(group.tags) ? group.tags : []
    if (tags.length) {
      this.description = tags.map((t) => `#${t}`).join(', ')
      const tooltip = new vscode.MarkdownString(undefined, true)
      tooltip.appendMarkdown(`**Etiketler:** ${tags.map((t) => `\`#${t}\``).join(' ')}`)
      this.tooltip = tooltip
    }
  }
}
