import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import { makeCommandId } from '@util/command-id'
import TreeItemKind from '../enumeration/tree-item-kind'
import type { TagStat } from './tree-tag-group-item'
import * as Message from '@lib/message'

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
      title: Message.Tag.filterCommandTitle(),
      arguments: [stat.tag],
    }
    const summaryParts: string[] = []
    if (stat.groupCount > 0) summaryParts.push(Message.Format.groupCount(stat.groupCount))
    if (stat.fileCount > 0) summaryParts.push(Message.Format.fileCount(stat.fileCount))
    const summary = summaryParts.length ? summaryParts.join(', ') : Message.Tag.summaryNone()
    this.tooltip = isActive
      ? Message.Tag.activeTooltip(stat.tag)
      : Message.Tag.summaryTooltip(summary, stat.tag)
  }
}
