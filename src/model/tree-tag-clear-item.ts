import * as vscode from "vscode"
import TreeItem from "@model/tree-item"

export class TreeTagClearItem extends TreeItem {
  kind: "tag-clear" = "tag-clear"
  constructor() {
    super("Tüm Gruplar", vscode.TreeItemCollapsibleState.None)
    this.contextValue = "tag.clear"
    this.iconPath = new vscode.ThemeIcon("clear-all")
    this.command = {
      command: "workscene.clearTagFilter",
      title: "Clear Tag Filter",
    }
    this.tooltip = "Etiket filtresini temizle"
  }
}
