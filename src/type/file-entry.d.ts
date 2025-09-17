interface FileEntry {
  rel: string
  name?: string
  description?: string
  kind?: "file" | "folder"
}

export default FileEntry