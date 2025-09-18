import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

type DirEntry = [string, FileType]
type ReadDirectoryFn = (uri: Uri) => Promise<DirEntry[]>

enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
}

class Uri {
  fsPath: string

  private constructor(fsPath: string) {
    this.fsPath = path.normalize(fsPath)
  }

  static parse(target: string): Uri {
    if (!target.startsWith('file:')) {
      throw new Error('Only file URIs are supported in the test mock.')
    }
    return new Uri(fileURLToPath(target))
  }

  static file(target: string): Uri {
    return new Uri(target)
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return Uri.file(path.join(base.fsPath, ...segments))
  }

  toString(): string {
    return pathToFileURL(this.fsPath).toString()
  }
}

const workspace = {
  workspaceFolders: undefined as Array<{ uri: Uri; name: string; index: number }> | undefined,
  fs: {
    readDirectory: async (_uri: Uri): Promise<DirEntry[]> => {
      throw new Error('workspace.fs.readDirectory mock not provided')
    },
  },
}

function __setWorkspaceFolders(folders: string[]): void {
  workspace.workspaceFolders = folders.map((folder, index) => ({
    uri: Uri.file(folder),
    name: path.basename(folder),
    index,
  }))
}

function __setReadDirectory(fn: ReadDirectoryFn): void {
  workspace.fs.readDirectory = fn
}

export { Uri, FileType, workspace, __setWorkspaceFolders, __setReadDirectory }
