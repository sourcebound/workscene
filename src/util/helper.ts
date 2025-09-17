import * as vscode from "vscode"
import Group from "@type/group"
import TreeItem from "@model/tree-item"
import { TreeGroupItem } from "@model/tree-group-item"
import { TreeFileItem } from "@model/tree-file-item"
import { fromRelativeToUri } from "@util/collect-files"
/** Yardımcı: grup ve dosya çocuklarını üretir. */
export function getGroupChildrenItems(
  group: Group,
  basePath: string,
  groupIconPath?: { light: vscode.Uri; dark: vscode.Uri }
): TreeItem[] {
  const items: TreeItem[] = []
  for (const child of group.children ?? []) {
    items.push(new TreeGroupItem(child, groupIconPath))
  }
  for (const fe of group.files) {
    items.push(
      new TreeFileItem(fromRelativeToUri(fe.rel, basePath), group.id, fe)
    )
  }
  return items
}
