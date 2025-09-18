/**
 * constants.ts
 *
 * Eklentide birden fazla yerde kullanılan sabitleri tek bir yerde toplar.
 * Bu sayede isimler tek kaynaktan yönetilir ve anlamları netleşir.
 */

export const APP_NAME: string = 'Workscene'

export const EXTENSION_ID: string = APP_NAME.toLowerCase()

/**
 * @description Global Memento anahtarı (ileride ihtiyaç halinde)
 */
export const STATE_KEY: string = `${EXTENSION_ID}.state`

export const CONFIG_FILE_EXTENSION: string = 'json'

/**
 * @description Workspace kökünde saklanan konfigürasyon dosyasının adı
 */
export const CONFIG_FILE_BASENAME: string = `${EXTENSION_ID}.config.${CONFIG_FILE_EXTENSION}`

/**
 * @description Görünüm kimliği (package.json → contributes.views.explorer[].id ile eşleşmeli)
 */
export const VIEW_ID: string = `${EXTENSION_ID}View`

/**
 * @description Makes a unique identifier for the command
 */
export const makeCommandId = (command: string): string => `${EXTENSION_ID}.${command}`

export const makeViewTitle = (title?: string | undefined): string =>
  title ? `${APP_NAME} (${title})` : APP_NAME
