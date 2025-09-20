import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import Group from '@type/group'
import TreeItemKind from '../enumeration/tree-item-kind'
import * as Message from '@lib/message'
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
    const descriptionParts: string[] = []
    if (group.description && group.description.trim()) {
      descriptionParts.push(group.description.trim())
    }
    if (tags.length) {
      descriptionParts.push(tags.map((t) => `#${t}`).join(', '))
    }
    if (descriptionParts.length) {
      this.description = descriptionParts.join(' • ')
      const tooltip = new vscode.MarkdownString(undefined, true)
      if (group.description && group.description.trim()) {
        const label = Message.Group.tooltipDescriptionLabel()
        tooltip.appendMarkdown(`${label} ${group.description.trim()}`)
        if (tags.length) tooltip.appendMarkdown('\n\n')
      }
      if (tags.length) {
        const label = Message.Group.tooltipTagsLabel()
        tooltip.appendMarkdown(`${label} ${tags.map((t) => `\`#${t}\``).join(' ')}`)
      }
      this.tooltip = tooltip
    }
  }
}
