import * as vscode from 'vscode'
import TreeItemKind from './tree-item-kind'

/**
 * Görünümde gösterilen ağaç düğümlerini tanımlar. `GroupItem` bir grup, `FileItem`
 * bir dosyayı temsil eder. Her ikisi de VS Code `TreeItem`ından türetilir.
 */
abstract class TreeItem extends vscode.TreeItem {
  abstract kind: TreeItemKind
  groupId?: string
}

export default TreeItem
