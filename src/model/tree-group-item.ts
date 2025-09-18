import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import Group from '@type/group'
export class TreeGroupItem extends TreeItem {
  kind: 'group' = 'group' as const
  constructor(
    public readonly group: Group,
    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
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
