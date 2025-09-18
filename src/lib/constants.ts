/**
 * constants.ts
 *
 * Eklentide birden fazla yerde kullanılan sabitleri tek bir yerde toplar.
 * Bu sayede isimler tek kaynaktan yönetilir ve anlamları netleşir.
 */

/**
 * @description Global Memento anahtarı (ileride ihtiyaç halinde)
 */
export const STATE_KEY: string = 'workscene.state'

/**
 * @description Workspace kökünde saklanan konfigürasyon dosyasının adı
 */
export const CONFIG_FILE_BASENAME: string = 'workscene.config.json'

/**
 * @description Görünüm kimliği (package.json → contributes.views.explorer[].id ile eşleşmeli)
 */
export const VIEW_ID: string = 'worksceneView'

export const APP_NAME: string = 'Workscene'

export const EXTENSION_ID: string = APP_NAME.toLowerCase()

/**
 * @description Makes a unique identifier for the command
 */
export const makeCommandId = (command: string): string => `${EXTENSION_ID}.${command}`

export const makeViewTitle = (title?: string | undefined): string =>
  title ? `${APP_NAME} (${title})` : APP_NAME
