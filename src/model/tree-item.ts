import { TreeItem as VSTreeItem } from 'vscode'
import TreeItemKind from '../enumeration/tree-item-kind'

/**
 * @summary Görünümde gösterilen ağaç düğümlerini tanımlar. `GroupItem` bir grup, `FileItem`
 * bir dosyayı temsil eder. Her ikisi de VS Code `TreeItem`ından türetilir.
 */
abstract class TreeItem extends VSTreeItem {
  abstract kind: TreeItemKind
  groupId?: string
}

export default TreeItem
