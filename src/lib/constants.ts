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
