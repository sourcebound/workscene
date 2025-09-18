import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
export class TreeTagGroupItem extends TreeItem {
  kind: 'tag-group' = 'tag-group' as const
  constructor(
    public readonly tags: ReadonlyArray<{ tag: string; count: number }>,
    public readonly activeTag: string | undefined,
  ) {
    super(
      'Etiketler',
      tags.length > 0 || activeTag
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    )
    this.contextValue = 'tagGroup'
    this.iconPath = new vscode.ThemeIcon('tag')
    if (activeTag) {
      this.description = `#${activeTag}`
    } else if (tags.length) {
      this.description = `${tags.length}`
    }
  }
}
