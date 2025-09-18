import * as vscode from 'vscode'
import TreeItem from '@model/tree-item'
import { makeCommandId } from '@lib/constants'
export class TreeTagClearItem extends TreeItem {
  kind: 'tag-clear' = 'tag-clear' as const
  constructor() {
    super('Tüm Gruplar', vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'tag.clear'
    this.iconPath = new vscode.ThemeIcon('clear-all')
    this.command = {
      command: makeCommandId('clearTagFilter'),
      title: 'Clear Tag Filter',
    }
    this.tooltip = 'Etiket filtresini temizle'
  }
}
