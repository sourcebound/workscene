import * as vscode from "vscode"
import TreeItem from "@model/tree-item"
import FileEntry from "@type/file-entry"
export class TreeFileItem extends TreeItem {
  kind: "file" = "file"
  constructor(
    public readonly uri: vscode.Uri,
    groupId: string,
    public readonly entry: FileEntry
  ) {
    super(entry.name ?? entry.rel, vscode.TreeItemCollapsibleState.None)
    this.contextValue = "file"
    this.resourceUri = uri
    this.groupId = groupId
    this.description = entry.description
    if (entry.kind === "folder") {
      this.iconPath = new vscode.ThemeIcon("folder")
      this.command = undefined
    } else {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri],
      }
    }
  }
}
