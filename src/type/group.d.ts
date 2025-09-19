import FileEntry from './file-entry'
interface Group {
  id: string
  name: string
  description?: string
  files: FileEntry[]
  children?: Group[]
  tags?: string[]
  iconId?: string
  colorName?: string
}

export default Group
