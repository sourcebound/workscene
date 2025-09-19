interface FileEntry {
  rel: string
  name?: string
  description?: string
  kind?: 'file' | 'folder'
  tags?: string[]
}

export default FileEntry
