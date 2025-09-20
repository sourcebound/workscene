import * as l10n from '@vscode/l10n'
import { EXTENSION_ID } from './constants'

export const Info = {
  addTabsToGroup: (groupName: string, added: number) =>
    l10n.t('{0} grubuna {1} sekme eklendi.', groupName, added),
  noOpenTabs: () => l10n.t('Açık dosya sekmesi bulunamadı.'),
  noFilesToOpenInGroup: () => l10n.t('Bu grupta açılacak dosya yok.'),
  skippedFolders: (count: number) =>
    l10n.t('{0} klasör atlandı. Bu komut yalnızca dosyaları açar.', count),
  closedTabsRestored: () => l10n.t('Kapatılan sekmeler geri yüklendi.'),
  itemsRemoved: (count: number) => l10n.t('{0} öğe kaldırıldı.', count),
  explorerSelectionMissing: () => l10n.t("Explorer'dan bir veya daha fazla öğe seçin."),
  itemsAddedToGroup: (groupName: string, added: number) =>
    l10n.t('{0} grubuna {1} öğe eklendi.', groupName, added),
  itemsAlreadyInGroup: () => l10n.t('Seçilen tüm öğeler zaten grupta mevcut.'),
  itemsMovedToGroup: (count: number, groupName: string) =>
    l10n.t('{0} öğe {1} grubuna taşındı.', count, groupName),
  groupIconsUpdated: (count: number) => l10n.t('{0} grup simgesi güncellendi.', count),
  groupColorsUpdated: (count: number) => l10n.t('{0} grubun rengi güncellendi.', count),
  groupsExported: () => l10n.t('Gruplar başarıyla dışa aktarıldı.'),
  groupsImported: () => l10n.t('Gruplar başarıyla içe aktarıldı.'),
  addGroupFirst: () => l10n.t('Önce bir grup ekleyin.'),
  createSaveToDiskOutputChannelMessage: (elapsed: number, bytes: Uint8Array) =>
    l10n.t('{0}ms, [{1}] saveToDisk: size={2} bytes', elapsed, EXTENSION_ID, bytes.byteLength),
} as const

export const Warning = {
  confirmRemoveGroup: (name: string) =>
    l10n.t("'{0}' grubu ve alt öğeleri kaldırılacak. Devam edilsin mi?", name),
  confirmRemoveFile: (name: string) =>
    l10n.t("'{0}' gruptan kaldırılacak. Devam edilsin mi?", name),
  confirmRemoveMultiple: (summary: string) =>
    l10n.t('Seçili {0} kaldırılacak. Devam edilsin mi?', summary),
} as const

export const Button = {
  remove: () => l10n.t('Kaldır'),
  cancel: () => l10n.t('İptal'),
} as const

export const Error = {
  applyHexFailed: () => l10n.t('Hex rengi uygularken ayar güncellenemedi.'),
  importInvalid: () => l10n.t('Geçersiz JSON dosyası. İçe aktarma başarısız oldu.'),
  saveFailed: () => l10n.t('Kaydetme başarısız oldu.'),
} as const

export const Prompt = {
  newGroupName: () => l10n.t('Yeni grup adı'),
  groupName: () => l10n.t('Grup adı'),
  renameGroup: () => l10n.t('Yeni ad'),
  descriptionOptional: () => l10n.t('Açıklama (isteğe bağlı)'),
  groupTags: () => l10n.t('Grup etiketleri (virgülle ayrılmış)'),
  filterGroups: () => l10n.t('Grupları filtrelemek için metin girin. Temizlemek için boş bırakın.'),
  hexColor: () => l10n.t('Hex renk (örn. #FF8800)'),
  aliasOptional: () => l10n.t('Takma ad (isteğe bağlı)'),
  fileTags: () => l10n.t('Dosya etiketleri (virgülle ayrılmış)'),
} as const

export const Placeholder = {
  selectGroupForTabs: () => l10n.t('Sekmeleri eklenecek grubu seçin'),
  groupTags: () => l10n.t('örn. ui, onboarding'),
  selectGroupForItems: () => l10n.t('Seçilenleri eklenecek grubu seçin'),
  sortGroup: () => l10n.t('Grubu sırala'),
  filterGroups: () => l10n.t('Grupları ada göre filtrele'),
  bulkGroupIcon: () => l10n.t('Grup simgesi (tüm seçilenler)'),
  singleGroupIcon: () => l10n.t('Grup simgesi...'),
  hexInput: () => l10n.t('#RRGGBB'),
  selectColorMultiple: () => l10n.t('Seçili gruplar için renk'),
  selectColorSingle: () => l10n.t('Bu grup için renk seçin'),
  fileTags: () => l10n.t('örn. helper, api'),
  folderHandling: () => l10n.t('Seçilen klasör(ler)i nasıl eklemek istersiniz?'),
} as const

export const Label = {
  quickPickNewGroup: () => l10n.t('$(new-folder) Yeni Grup...'),
  addFoldersAsItems: () => l10n.t('Klasörleri öğe olarak ekle'),
  addFirstLevelFiles: () => l10n.t('Yalnızca ilk seviyedeki dosyaları ekle'),
  addAllFilesRecursive: () => l10n.t('Tüm dosyaları (özyinelemeli) ekle'),
  defaultIcon: () => l10n.t('Varsayılan (star)'),
  noIcon: () => l10n.t('Simge yok'),
  defaultColor: () => l10n.t('Varsayılan'),
  customHex: () => l10n.t('Özel Hex…'),
  sortAlphabetical: () => l10n.t('Alfabetik sırala'),
  sortByFolder: () => l10n.t('Klasöre göre sırala'),
  sortByFileType: () => l10n.t('Dosya türüne göre sırala'),
} as const

export const Description = {
  keepFoldersSingleEntry: () => l10n.t('Klasörleri tek birer öğe olarak tut'),
} as const

export const Validation = {
  hexInvalid: () => l10n.t('Geçerli bir hex renk girin'),
} as const

export const Format = {
  groupCount: (count: number) => l10n.t('{0} grup', count),
  itemCount: (count: number) => l10n.t('{0} öğe', count),
  fileCount: (count: number) => l10n.t('{0} dosya', count),
} as const

export const Dialog = {
  addToGroup: () => l10n.t('Gruba ekle'),
  exportSaveLabel: () => l10n.t('Grupları dışa aktar'),
  importOpenLabel: () => l10n.t('Grupları içe aktar'),
} as const

export const Defaults = {
  groupBaseName: () => l10n.t('Grup'),
} as const

export const Tag = {
  filterCommandTitle: () => l10n.t('Etikete göre filtrele'),
  summaryNone: () => l10n.t('Eşleşme yok'),
  activeTooltip: (tag: string) => l10n.t('#{0} etiketiyle filtreleniyor', tag),
  summaryTooltip: (summary: string, tag: string) =>
    l10n.t('{0} #{1} etiketiyle eşleşiyor', summary, tag),
  sectionLabel: () => l10n.t('Etiketler'),
  clearAllLabel: () => l10n.t('Tüm Gruplar'),
  clearCommandTitle: () => l10n.t('Etiket filtresini temizle'),
  clearTooltip: () => l10n.t('Etiket filtresini temizle'),
} as const

export const Group = {
  tooltipDescriptionLabel: () => l10n.t('**Açıklama:**'),
  tooltipTagsLabel: () => l10n.t('**Etiketler:**'),
} as const

export const File = {
  openCommandTitle: () => l10n.t('Dosyayı aç'),
} as const
