import * as vscode from "vscode"
import TreeItem from "@model/tree-item"
export class TreeTagItem extends TreeItem {
  kind: "tag" = "tag"
  constructor(
    public readonly tag: string,
    public readonly count: number,
    isActive: boolean
  ) {
    super(`#${tag}`, vscode.TreeItemCollapsibleState.None)
    this.description = `${count}`
    this.contextValue = isActive ? "tag.active" : "tag"
    this.iconPath = new vscode.ThemeIcon("tag")
    this.command = {
      command: "workscene.applyTagFilter",
      title: "Filter by Tag",
      arguments: [tag],
    }
    this.tooltip = isActive
      ? `#${tag} etiketiyle filtreleniyor`
      : `${count} grup #${tag} etiketiyle eşleşiyor`
  }
}
