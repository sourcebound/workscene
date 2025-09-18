import { EXTENSION_ID } from '@lib/constants'
export function createSaveToDiskOutputChannelMessage(elapsed: number, bytes: Uint8Array) {
  return `[${EXTENSION_ID}] saveToDisk: ${elapsed}ms, size=${bytes.byteLength} bytes`
}
