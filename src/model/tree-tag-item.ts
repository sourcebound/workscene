import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import { makeCommandId } from '@lib/constants'
export class TreeTagItem extends TreeItem {
  kind: 'tag' = 'tag' as const
  constructor(
    public readonly tag: string,
    public readonly count: number,
    isActive: boolean,
  ) {
    super(`#${tag}`, vscode.TreeItemCollapsibleState.None)
    this.description = `${count}`
    this.contextValue = isActive ? 'tag.active' : 'tag'
    this.iconPath = new vscode.ThemeIcon('tag')
    this.command = {
      command: makeCommandId('applyTagFilter'),
      title: 'Etikete Göre Filtrele',
      arguments: [tag],
    }
    this.tooltip = isActive
      ? `#${tag} etiketiyle filtreleniyor`
      : `${count} grup #${tag} etiketiyle eşleşiyor`
  }
}
