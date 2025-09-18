import * as vscode from 'vscode'

/**
 * Görünümde gösterilen ağaç düğümlerini tanımlar. `GroupItem` bir grup, `FileItem`
 * bir dosyayı temsil eder. Her ikisi de VS Code `TreeItem`ından türetilir.
 */
abstract class TreeItem extends vscode.TreeItem {
  abstract kind: 'group' | 'file' | 'tag' | 'tag-group' | 'tag-clear'
  groupId?: string
}

export default TreeItem
