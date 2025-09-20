import { ThemeIcon, TreeItemCollapsibleState } from 'vscode'
import TreeItem from '@model/tree-item'
import { makeCommandId } from '@util/command-id'
import TreeItemKind from '../enumeration/tree-item-kind'
import * as Message from '@lib/message'

export class TreeTagClearItem extends TreeItem {
  kind: TreeItemKind.TagClear = TreeItemKind.TagClear
  constructor() {
    super(Message.Tag.clearAllLabel(), TreeItemCollapsibleState.None)
    this.contextValue = 'tag.clear'
    this.iconPath = new ThemeIcon('clear-all')
    this.command = {
      command: makeCommandId('clearTagFilter'),
      title: Message.Tag.clearCommandTitle(),
    }
    this.tooltip = Message.Tag.clearTooltip()
  }
}
