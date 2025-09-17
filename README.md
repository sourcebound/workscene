## Workscene — Mantıksal Dosya Gruplama

Workscene, büyük projelerde dosyalarınızı dosya sistemi yapısını değiştirmeden organize etmenizi sağlayan bir Explorer görünümüdür. Xcode’daki “Group” modelinden esinlenir: dosyaları mantıksal gruplar halinde bir araya getirir; klasör/taşıma yapmaz, git geçmişinizi kirletmez.

### Grup vs. Klasör
- Klasör: Dosya sisteminde gerçek dizindir; taşıma/yeniden adlandırma dosya sistemini etkiler.
- Grup: Proje içi mantıksal koleksiyondur; disk yapısını etkilemez. Klasöre eşlenmek zorunda değildir.

### Neden Workscene?
- Mantıksal gruplar: Diskteki klasör yapısını değiştirmeden düzenleyin.
- Büyük projelerde hız: İlgili dosyaları tek bakışta görün, hızlı açın.
- Kaynak kontrol dostu: Fiziksel taşıma/yeniden adlandırma yok.


### Özellikler
- Explorer’da özel “Workscene” paneli
- Grup ekle, alt grup ekle, yeniden adlandır, sil
- Dosyaları gruba ekle, gruplar arasında taşı
- Explorer’dan sürükle-bırak ile ekleme
- Açık sekmeleri gruba topluca ekleme
- Yapılandırma workspace kökünde `workscene.config.json` ile kalıcıdır

### Komutlar (Command Palette)
- Workscene: Add Group (`workscene.addGroup`)
- Workscene: Add Sub Group (`workscene.addSubGroup`)
- Workscene: Rename Group (`workscene.renameGroup`)
- Workscene: Remove (`workscene.remove`)
- Workscene: Add Files to Group (`workscene.addFiles`)
- Workscene: Add Open Tabs to Group (`workscene.addOpenTabsToGroup`)
- Workscene: Move to Group (`workscene.moveToGroup`)
- Workscene: Sort Group (`workscene.sortGroup`)
- Workscene: Filter Groups (`workscene.filterGroups`)
- Workscene: Clear Filter (`workscene.clearFilter`)
- Workscene: Change Group Icon (`workscene.changeGroupIcon`)
  - Not: Seçim listesinde “No Icon” ile grupları simgesiz gösterebilirsiniz.
- Workscene: Change Group Color (`workscene.changeGroupColor`)
- Workscene: Export (`workscene.export`)
- Workscene: Import (`workscene.import`)
- Workscene: Refresh (`workscene.refresh`)
- Workscene: Save Now (`workscene.saveNow`)
- Workscene: Expand All (`workscene.expandAll`)

Kısayollar:
- Enter / F2: Grup üzerinde iken yeniden adlandır (Workscene paneli odaklıyken)
- Backspace: Grup/dosya kaldır (Workscene paneli odaklıyken)

### Nasıl kullanılır?
1) Explorer’da “Workscene” panelini açın.
2) “Add Group” ile bir grup oluşturun (alt gruplar da ekleyebilirsiniz).
3) Dosyaları gruba ekleyin:
   - Komutla “Add Files to Group”
   - Explorer’dan sürükle-bırak
   - “Add Open Tabs to Group” ile açık sekmeleri topluca ekleyin
4) Dosyaları bağlam menüsünden başka bir gruba taşıyın.
5) “Sort/Filter” ile görünümü düzenleyin.

### Kalıcı veri (workscene.config.json)
- Workspace kökünde `workscene.config.json` oluşturulur. Gruplar ve dosyalar JSON olarak saklanır; ayrıca meta içerir.
- Dosya git’e eklenebilir; takımca aynı görünümü paylaşabilirsiniz.

Örnek:

```json
{
  "meta": {
    "basePath": "/Users/yourname/Projects/sample",
    "createdAt": "2025-08-24T10:00:00.000Z",
    "updatedAt": "2025-08-24T10:05:00.000Z",
    "version": 1
  },
  "groups": [
    {
      "id": "nm1ol38t9uameproycs",
      "name": "conf",
      "files": [
        { "rel": "package.json" },
        { "rel": "tsconfig.json" }
      ]
    }
  ]
}
```

### Ayarlar
- `workscene.autoCloseOnOpenAll` (boolean, default: false): Bir gruptaki tüm dosyaları açarken mevcut editörleri önce kapatır ve 5 saniyelik geri alma imkânı verir.

### Sürükle-Bırak davranışı
- Workscene paneli içinde grup/dosya taşıyabilirsiniz.
- Explorer’dan dosya/klasör bırakabilirsiniz. Klasör bırakıldığında “klasörü öğe olarak ekle / birinci seviye dosyaları ekle / tamamını özyineliyerek ekle” seçeneklerinden birini seçersiniz.

### Geliştirme
- Derleme: `npm run compile`
- İzleme: `npm run watch`

`vscode:prepublish` script’i yayın/paketleme sırasında otomatik derleme için ayarlı (kullanıyorsanız `vsce package` ile uyumludur).

### Lisans
- Lisans: GNU AGPLv3 (AGPL-3.0-only)
- Telif: 2025, sourcebound
- Detaylar için bkz. `LICENSE`
