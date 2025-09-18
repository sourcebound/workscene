export function createSaveToDiskOutputChannelMessage(elapsed: number, bytes: Uint8Array) {
  return `[workscene] saveToDisk: ${elapsed}ms, size=${bytes.byteLength} bytes`
}
