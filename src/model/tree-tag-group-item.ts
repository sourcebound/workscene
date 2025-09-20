import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import TreeItemKind from '../enumeration/tree-item-kind'
import * as Message from '@lib/message'

export interface TagStat {
  tag: string
  groupCount: number
  fileCount: number
}

export class TreeTagGroupItem extends TreeItem {
  kind: TreeItemKind.TagGroup = TreeItemKind.TagGroup
  constructor(
    public readonly tags: ReadonlyArray<TagStat>,
    public readonly activeTag: string | undefined,
  ) {
    super(
      Message.Tag.sectionLabel(),
      tags.length > 0 || activeTag
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    )
    this.contextValue = 'tagGroup'
    this.iconPath = new vscode.ThemeIcon('primitive-dot')
    if (activeTag) {
      this.description = `#${activeTag}`
    } else if (tags.length) {
      this.description = `${tags.length}`
    }
  }
}
