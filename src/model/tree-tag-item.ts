import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import { makeCommandId } from '@lib/constants'
import TreeItemKind from './tree-item-kind'
import type { TagStat } from './tree-tag-group-item'

export class TreeTagItem extends TreeItem {
  kind: TreeItemKind.Tag = TreeItemKind.Tag
  public readonly tag: string
  public readonly stat: TagStat
  constructor(stat: TagStat, isActive: boolean) {
    super(`#${stat.tag}`, vscode.TreeItemCollapsibleState.None)
    this.tag = stat.tag
    this.stat = stat
    const total = stat.groupCount + stat.fileCount
    this.description = `${total}`
    this.contextValue = isActive ? 'tag.active' : 'tag'
    this.iconPath = new vscode.ThemeIcon('primitive-dot')
    this.command = {
      command: makeCommandId('applyTagFilter'),
      title: 'Etikete Göre Filtrele',
      arguments: [stat.tag],
    }
    const summaryParts: string[] = []
    if (stat.groupCount > 0) summaryParts.push(`${stat.groupCount} grup`)
    if (stat.fileCount > 0) summaryParts.push(`${stat.fileCount} dosya`)
    const summary = summaryParts.length ? summaryParts.join(', ') : 'Eşleşme yok'
    this.tooltip = isActive
      ? `#${stat.tag} etiketiyle filtreleniyor`
      : `${summary} #${stat.tag} etiketiyle eşleşiyor`
  }
}
