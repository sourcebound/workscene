import * as changeCase from "change-case"

/**
 * constants.ts
 *
 * Eklentide birden fazla yerde kullanılan sabitleri tek bir yerde toplar.
 * Bu sayede isimler tek kaynaktan yönetilir ve anlamları netleşir.
 */

/**
 * @description Global Memento anahtarı (ileride ihtiyaç halinde)
 */
export const STATE_KEY = "workscene.state"

/**
 * @description Workspace kökünde saklanan konfigürasyon dosyasının adı
 */
export const CONFIG_FILE_BASENAME = "workscene.config.json"

/**
 * @description Görünüm kimliği (package.json → contributes.views.explorer[].id ile eşleşmeli)
 */
export const VIEW_ID = "worksceneView"

export const APP_NAME = "Workscene"

export const EXTENSION_ID = APP_NAME.toLowerCase()

/**
 * @description Makes a unique identifier for the command
 */
export const makeCommandId = (command: string) => `${EXTENSION_ID}.${command}`

export const makeViewTitle = (title?: string) => title ? `${APP_NAME} (${title})` : APP_NAME