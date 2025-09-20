import { EXTENSION_ID } from '@lib/constants'

// Komut için, extension'un kendi kimliği ile birleştirilmiş benzersiz bir kimliği oluşturur.
export const makeCommandId = <T extends string>(commandName: T): T =>
  (EXTENSION_ID + '.' + commandName) as T
