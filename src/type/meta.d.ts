/**
 * @description
 * Eklentinin kalıcı veri modeli. Gruplar ve dosyaların nasıl temsil edildiğini tanımlar.
 * @param Meta Kök yol ve sürüm/oluşturulma-zamanı gibi meta bilgiler.
 * @param Group Ağaç yapısında bir grup düğümü.
 * @param State Tüm görünümün kök durumu.
 *
 * @example
 * ```ts
 * const meta: Meta = {
 *    basePath: 'path/to/project',
 *    createdAt: '2025-01-01',
 *    updatedAt: '2025-01-01',
 *    version: 1
 * };
 * ```
 */
interface Meta {
  basePath: string
  createdAt: string
  updatedAt: string
  version: number
}

export default Meta