import type { AppLocale } from '@/i18n/config'
import { localeCodesList } from '@/i18n/localeRegistry'

import { applyUiTemplate, pickUiString } from '@/utilities/getLocalizedString'

/** Every `AppLocale` gets a string; unknown codes fall back to `english`. */
export function amzUiFillAllLocales(
  english: string,
  overrides: Partial<Record<AppLocale, string>>,
): Partial<Record<AppLocale, string>> {
  const m: Partial<Record<AppLocale, string>> = {}
  for (const code of localeCodesList) {
    const o = overrides[code]
    m[code] = typeof o === 'string' && o.trim() !== '' ? o : english
  }
  return m
}

const O = {
  zh: '分类',
  es: 'Categorías',
  pt: 'Categorias',
  fr: 'Catégories',
  de: 'Kategorien',
  it: 'Categorie',
  nl: 'Categorieën',
  pl: 'Kategorie',
  tr: 'Kategoriler',
  ja: 'カテゴリー',
  ko: '카테고리',
  ru: 'Категории',
  uk: 'Категорії',
  ar: 'الفئات',
  hi: 'श्रेणियाँ',
  vi: 'Danh mục',
  th: 'หมวดหมู่',
  id: 'Kategori',
  ms: 'Kategori',
} as const satisfies Partial<Record<AppLocale, string>>

export const AMZ_BROWSE_CATEGORIES = amzUiFillAllLocales('Categories', O)

const CLEAR = {
  zh: '清除筛选',
  es: 'Borrar filtros',
  pt: 'Limpar filtros',
  fr: 'Effacer les filtres',
  de: 'Filter zurücksetzen',
  it: 'Cancella filtri',
  nl: 'Filters wissen',
  pl: 'Wyczyść filtry',
  tr: 'Filtreleri temizle',
  ja: 'フィルターを解除',
  ko: '필터 지우기',
  ru: 'Сбросить фильтры',
  uk: 'Скинути фільтри',
  ar: 'مسح عوامل التصفية',
  hi: 'फ़िल्टर साफ़ करें',
  vi: 'Xóa bộ lọc',
  th: 'ล้างตัวกรอง',
  id: 'Hapus filter',
  ms: 'Kosongkan penapis',
} as const satisfies Partial<Record<AppLocale, string>>

export const AMZ_BROWSE_CLEAR_FILTERS = amzUiFillAllLocales('Clear filters', CLEAR)

export const AMZ_REVIEWS_ALL = amzUiFillAllLocales('All Reviews', {
  zh: '全部评测',
  es: 'Todas las reseñas',
  pt: 'Todas as análises',
  fr: 'Tous les avis',
  de: 'Alle Bewertungen',
  it: 'Tutte le recensioni',
  nl: 'Alle reviews',
  pl: 'Wszystkie recenzje',
  tr: 'Tüm incelemeler',
  ja: 'すべてのレビュー',
  ko: '모든 리뷰',
  ru: 'Все обзоры',
  uk: 'Усі огляди',
  ar: 'جميع المراجعات',
  hi: 'सभी समीक्षाएँ',
  vi: 'Tất cả đánh giá',
  th: 'รีวิวทั้งหมด',
  id: 'Semua ulasan',
  ms: 'Semua ulasan',
})

export const AMZ_REVIEWS_SHOWING_ONE = amzUiFillAllLocales('Showing 1 review', {
  zh: '共 1 篇评测',
  es: 'Mostrando 1 reseña',
  pt: 'A mostrar 1 análise',
  fr: '1 avis affiché',
  de: '1 Bewertung angezeigt',
  it: 'Mostra 1 recensione',
  nl: '1 review weergegeven',
  pl: 'Wyświetlono 1 recenzję',
  tr: '1 inceleme gösteriliyor',
  ja: 'レビュー 1 件を表示',
  ko: '리뷰 1개 표시',
  ru: 'Показан 1 обзор',
  uk: 'Показано 1 огляд',
  ar: 'عرض مراجعة واحدة',
  hi: '1 समीक्षा दिखाई जा रही है',
  vi: 'Đang hiển thị 1 đánh giá',
  th: 'แสดง 1 บทวิจารณ์',
  id: 'Menampilkan 1 ulasan',
  ms: 'Menunjukkan 1 ulasan',
})

export const AMZ_REVIEWS_SHOWING_MANY = amzUiFillAllLocales('Showing {count} reviews', {
  zh: '共 {count} 篇评测',
  es: 'Mostrando {count} reseñas',
  pt: 'A mostrar {count} análises',
  fr: '{count} avis affichés',
  de: '{count} Bewertungen angezeigt',
  it: 'Mostra {count} recensioni',
  nl: '{count} reviews weergegeven',
  pl: 'Wyświetlono {count} recenzji',
  tr: '{count} inceleme gösteriliyor',
  ja: 'レビュー {count} 件を表示',
  ko: '리뷰 {count}개 표시',
  ru: 'Показано обзоров: {count}',
  uk: 'Показано оглядів: {count}',
  ar: 'عرض {count} مراجعات',
  hi: '{count} समीक्षाएँ दिखाई जा रही हैं',
  vi: 'Đang hiển thị {count} đánh giá',
  th: 'แสดง {count} บทวิจารณ์',
  id: 'Menampilkan {count} ulasan',
  ms: 'Menunjukkan {count} ulasan',
})

export const AMZ_REVIEWS_SEARCH_PLACEHOLDER = amzUiFillAllLocales('Search reviews…', {
  zh: '搜索评测…',
  es: 'Buscar reseñas…',
  pt: 'Procurar análises…',
  fr: 'Rechercher des avis…',
  de: 'Bewertungen suchen…',
  it: 'Cerca recensioni…',
  nl: 'Zoek reviews…',
  pl: 'Szukaj recenzji…',
  tr: 'İnceleme ara…',
  ja: 'レビューを検索…',
  ko: '리뷰 검색…',
  ru: 'Поиск обзоров…',
  uk: 'Пошук оглядів…',
  ar: 'ابحث عن المراجعات…',
  hi: 'समीक्षाएँ खोजें…',
  vi: 'Tìm đánh giá…',
  th: 'ค้นหารีวิว…',
  id: 'Cari ulasan…',
  ms: 'Cari ulasan…',
})

export const AMZ_REVIEWS_EMPTY = amzUiFillAllLocales('No reviews found', {
  zh: '未找到评测',
  es: 'No se encontraron reseñas',
  pt: 'Nenhuma análise encontrada',
  fr: 'Aucun avis trouvé',
  de: 'Keine Bewertungen gefunden',
  it: 'Nessuna recensione trovata',
  nl: 'Geen reviews gevonden',
  pl: 'Brak recenzji',
  tr: 'İnceleme bulunamadı',
  ja: 'レビューが見つかりません',
  ko: '리뷰를 찾을 수 없습니다',
  ru: 'Обзоры не найдены',
  uk: 'Оглядів не знайдено',
  ar: 'لم يتم العثور على مراجعات',
  hi: 'कोई समीक्षा नहीं मिली',
  vi: 'Không tìm thấy đánh giá',
  th: 'ไม่พบรีวิว',
  id: 'Tidak ada ulasan',
  ms: 'Tiada ulasan dijumpai',
})

export const AMZ_GUIDES_ALL = amzUiFillAllLocales('All Guides', {
  zh: '全部指南',
  es: 'Todas las guías',
  pt: 'Todos os guias',
  fr: 'Tous les guides',
  de: 'Alle Ratgeber',
  it: 'Tutte le guide',
  nl: 'Alle gidsen',
  pl: 'Wszystkie poradniki',
  tr: 'Tüm rehberler',
  ja: 'すべてのガイド',
  ko: '모든 가이드',
  ru: 'Все гайды',
  uk: 'Усі гайди',
  ar: 'جميع الأدلة',
  hi: 'सभी गाइड',
  vi: 'Tất cả hướng dẫn',
  th: 'คู่มือทั้งหมด',
  id: 'Semua panduan',
  ms: 'Semua panduan',
})

export const AMZ_GUIDES_SHOWING_ONE = amzUiFillAllLocales('Showing 1 article', {
  zh: '共 1 篇',
  es: 'Mostrando 1 artículo',
  pt: 'A mostrar 1 artigo',
  fr: '1 article affiché',
  de: '1 Artikel angezeigt',
  it: 'Mostra 1 articolo',
  nl: '1 artikel weergegeven',
  pl: 'Wyświetlono 1 artykuł',
  tr: '1 makale gösteriliyor',
  ja: '記事 1 件を表示',
  ko: '글 1개 표시',
  ru: 'Показана 1 статья',
  uk: 'Показано 1 статтю',
  ar: 'عرض مقال واحد',
  hi: '1 लेख दिखाया जा रहा है',
  vi: 'Đang hiển thị 1 bài viết',
  th: 'แสดง 1 บทความ',
  id: 'Menampilkan 1 artikel',
  ms: 'Menunjukkan 1 artikel',
})

export const AMZ_GUIDES_SHOWING_MANY = amzUiFillAllLocales('Showing {count} articles', {
  zh: '共 {count} 篇',
  es: 'Mostrando {count} artículos',
  pt: 'A mostrar {count} artigos',
  fr: '{count} articles affichés',
  de: '{count} Artikel angezeigt',
  it: 'Mostra {count} articoli',
  nl: '{count} artikelen weergegeven',
  pl: 'Wyświetlono {count} artykułów',
  tr: '{count} makale gösteriliyor',
  ja: '記事 {count} 件を表示',
  ko: '글 {count}개 표시',
  ru: 'Показано статей: {count}',
  uk: 'Показано статей: {count}',
  ar: 'عرض {count} مقالات',
  hi: '{count} लेख दिखाए जा रहे हैं',
  vi: 'Đang hiển thị {count} bài viết',
  th: 'แสดง {count} บทความ',
  id: 'Menampilkan {count} artikel',
  ms: 'Menunjukkan {count} artikel',
})

export const AMZ_GUIDES_SEARCH_PLACEHOLDER = amzUiFillAllLocales('Search guides…', {
  zh: '搜索指南…',
  es: 'Buscar guías…',
  pt: 'Procurar guias…',
  fr: 'Rechercher des guides…',
  de: 'Ratgeber suchen…',
  it: 'Cerca guide…',
  nl: 'Zoek gidsen…',
  pl: 'Szukaj poradników…',
  tr: 'Rehber ara…',
  ja: 'ガイドを検索…',
  ko: '가이드 검색…',
  ru: 'Поиск гайдов…',
  uk: 'Пошук гайдів…',
  ar: 'ابحث عن الأدلة…',
  hi: 'गाइड खोजें…',
  vi: 'Tìm hướng dẫn…',
  th: 'ค้นหาคู่มือ…',
  id: 'Cari panduan…',
  ms: 'Cari panduan…',
})

export const AMZ_GUIDES_EMPTY = amzUiFillAllLocales('No guides found', {
  zh: '未找到指南',
  es: 'No se encontraron guías',
  pt: 'Nenhum guia encontrado',
  fr: 'Aucun guide trouvé',
  de: 'Keine Ratgeber gefunden',
  it: 'Nessuna guida trovata',
  nl: 'Geen gidsen gevonden',
  pl: 'Brak poradników',
  tr: 'Rehber bulunamadı',
  ja: 'ガイドが見つかりません',
  ko: '가이드를 찾을 수 없습니다',
  ru: 'Гайды не найдены',
  uk: 'Гайдів не знайдено',
  ar: 'لم يتم العثور على أدلة',
  hi: 'कोई गाइड नहीं मिला',
  vi: 'Không tìm thấy hướng dẫn',
  th: 'ไม่พบคู่มือ',
  id: 'Tidak ada panduan',
  ms: 'Tiada panduan dijumpai',
})

export const AMZ_PRODUCTS_ALL = amzUiFillAllLocales('All products', {
  zh: '全部商品',
  es: 'Todos los productos',
  pt: 'Todos os produtos',
  fr: 'Tous les produits',
  de: 'Alle Produkte',
  it: 'Tutti i prodotti',
  nl: 'Alle producten',
  pl: 'Wszystkie produkty',
  tr: 'Tüm ürünler',
  ja: 'すべての商品',
  ko: '모든 상품',
  ru: 'Все товары',
  uk: 'Усі товари',
  ar: 'جميع المنتجات',
  hi: 'सभी उत्पाद',
  vi: 'Tất cả sản phẩm',
  th: 'สินค้าทั้งหมด',
  id: 'Semua produk',
  ms: 'Semua produk',
})

export const AMZ_PRODUCTS_SHOWING_ONE = amzUiFillAllLocales('Showing 1 product', {
  zh: '共 1 件商品',
  es: 'Mostrando 1 producto',
  pt: 'A mostrar 1 produto',
  fr: '1 produit affiché',
  de: '1 Produkt angezeigt',
  it: 'Mostra 1 prodotto',
  nl: '1 product weergegeven',
  pl: 'Wyświetlono 1 produkt',
  tr: '1 ürün gösteriliyor',
  ja: '商品 1 件を表示',
  ko: '상품 1개 표시',
  ru: 'Показан 1 товар',
  uk: 'Показано 1 товар',
  ar: 'عرض منتج واحد',
  hi: '1 उत्पाद दिखाया जा रहा है',
  vi: 'Đang hiển thị 1 sản phẩm',
  th: 'แสดง 1 สินค้า',
  id: 'Menampilkan 1 produk',
  ms: 'Menunjukkan 1 produk',
})

export const AMZ_PRODUCTS_SHOWING_MANY = amzUiFillAllLocales('Showing {count} products', {
  zh: '共 {count} 件商品',
  es: 'Mostrando {count} productos',
  pt: 'A mostrar {count} produtos',
  fr: '{count} produits affichés',
  de: '{count} Produkte angezeigt',
  it: 'Mostra {count} prodotti',
  nl: '{count} producten weergegeven',
  pl: 'Wyświetlono {count} produktów',
  tr: '{count} ürün gösteriliyor',
  ja: '商品 {count} 件を表示',
  ko: '상품 {count}개 표시',
  ru: 'Показано товаров: {count}',
  uk: 'Показано товарів: {count}',
  ar: 'عرض {count} منتجات',
  hi: '{count} उत्पाद दिखाए जा रहे हैं',
  vi: 'Đang hiển thị {count} sản phẩm',
  th: 'แสดง {count} สินค้า',
  id: 'Menampilkan {count} produk',
  ms: 'Menunjukkan {count} produk',
})

export const AMZ_PRODUCTS_NO_ACTIVE = amzUiFillAllLocales(
  'No active offers yet for this site.',
  {
    zh: '本站暂无在售商品。',
    es: 'Aún no hay ofertas activas en este sitio.',
    pt: 'Ainda não há ofertas ativas neste site.',
    fr: "Pas encore d’offres actives sur ce site.",
    de: 'Auf dieser Website gibt es noch keine aktiven Angebote.',
    it: 'Non ci sono ancora offerte attive su questo sito.',
    nl: 'Nog geen actieve aanbiedingen op deze site.',
    pl: 'Na tej stronie nie ma jeszcze aktywnych ofert.',
    tr: 'Bu sitede henüz aktif teklif yok.',
    ja: 'このサイトに有効な商品はまだありません。',
    ko: '이 사이트에 활성 상품이 없습니다.',
    ru: 'На этом сайте пока нет активных предложений.',
    uk: 'На цьому сайті ще немає активних пропозицій.',
    ar: 'لا توفرات نشطة بعد على هذا الموقع.',
    hi: 'इस साइट पर अभी कोई सक्रिय ऑफ़र नहीं है।',
    vi: 'Chưa có ưu đãi đang hoạt động trên trang này.',
    th: 'ยังไม่มีข้อเสนอที่ใช้งานบนไซต์นี้',
    id: 'Belum ada penawaran aktif di situs ini.',
    ms: 'Tiada tawaran aktif di tapak ini lagi.',
  },
)

export const AMZ_PRODUCTS_SEARCH_PLACEHOLDER = amzUiFillAllLocales('Search products…', {
  zh: '搜索商品…',
  es: 'Buscar productos…',
  pt: 'Procurar produtos…',
  fr: 'Rechercher des produits…',
  de: 'Produkte suchen…',
  it: 'Cerca prodotti…',
  nl: 'Zoek producten…',
  pl: 'Szukaj produktów…',
  tr: 'Ürün ara…',
  ja: '商品を検索…',
  ko: '상품 검색…',
  ru: 'Поиск товаров…',
  uk: 'Пошук товарів…',
  ar: 'ابحث عن المنتجات…',
  hi: 'उत्पाद खोजें…',
  vi: 'Tìm sản phẩm…',
  th: 'ค้นหาสินค้า…',
  id: 'Cari produk…',
  ms: 'Cari produk…',
})

export const AMZ_PRODUCTS_EMPTY_FILTERED = amzUiFillAllLocales('No products found', {
  zh: '未找到商品',
  es: 'No se encontraron productos',
  pt: 'Nenhum produto encontrado',
  fr: 'Aucun produit trouvé',
  de: 'Keine Produkte gefunden',
  it: 'Nessun prodotto trovato',
  nl: 'Geen producten gevonden',
  pl: 'Brak produktów',
  tr: 'Ürün bulunamadı',
  ja: '商品が見つかりません',
  ko: '상품을 찾을 수 없습니다',
  ru: 'Товары не найдены',
  uk: 'Товарів не знайдено',
  ar: 'لم يتم العثور على منتجات',
  hi: 'कोई उत्पाद नहीं मिला',
  vi: 'Không tìm thấy sản phẩm',
  th: 'ไม่พบสินค้า',
  id: 'Tidak ada produk',
  ms: 'Tiada produk dijumpai',
})

export const AMZ_ARTICLE_RELATED_REVIEWS = amzUiFillAllLocales('Related reviews', {
  zh: '相关评测',
  es: 'Reseñas relacionadas',
  pt: 'Análises relacionadas',
  fr: 'Avis associés',
  de: 'Ähnliche Bewertungen',
  it: 'Recensioni correlate',
  nl: 'Gerelateerde reviews',
  pl: 'Powiązane recenzje',
  tr: 'İlgili incelemeler',
  ja: '関連レビュー',
  ko: '관련 리뷰',
  ru: 'Похожие обзоры',
  uk: 'Схожі огляди',
  ar: 'مراجعات ذات صلة',
  hi: 'संबंधित समीक्षाएँ',
  vi: 'Đánh giá liên quan',
  th: 'รีวิวที่เกี่ยวข้อง',
  id: 'Ulasan terkait',
  ms: 'Ulasan berkaitan',
})

export const AMZ_ARTICLE_EXPERT_REVIEW = amzUiFillAllLocales('Expert review', {
  zh: '专家评测',
  es: 'Reseña experta',
  pt: 'Análise de especialista',
  fr: 'Avis d’expert',
  de: 'Expertenbewertung',
  it: 'Recensione esperta',
  nl: 'Expertrecensie',
  pl: 'Recenzja eksperta',
  tr: 'Uzman incelemesi',
  ja: 'エキスパートレビュー',
  ko: '전문가 리뷰',
  ru: 'Экспертный обзор',
  uk: 'Експертний огляд',
  ar: 'مراجعة خبير',
  hi: 'विशेषज्ञ समीक्षा',
  vi: 'Đánh giá chuyên gia',
  th: 'รีวิวจากผู้เชี่ยวชาญ',
  id: 'Ulasan ahli',
  ms: 'Ulasan pakar',
})

export const AMZ_GUIDE_READ_MIN = amzUiFillAllLocales('{count} min read', {
  zh: '约 {count} 分钟阅读',
  es: '{count} min de lectura',
  pt: '{count} min de leitura',
  fr: 'Lecture {count} min',
  de: '{count} Min. Lesezeit',
  it: '{count} min di lettura',
  nl: '{count} min lezen',
  pl: '{count} min czytania',
  tr: '{count} dk okuma',
  ja: '約 {count} 分で読める',
  ko: '읽는 시간 {count}분',
  ru: '{count} мин чтения',
  uk: '{count} хв читання',
  ar: '{count} د قراءة',
  hi: '{count} मिनट पढ़ने का समय',
  vi: 'Đọc {count} phút',
  th: 'อ่าน {count} นาที',
  id: '{count} menit baca',
  ms: '{count} min baca',
})

/** Default header nav labels by `href` (amz paths, same as `navigation.main`). */
export const AMZ_NAV_LABELS_BY_HREF: Record<string, Partial<Record<AppLocale, string>>> = {
  '/': amzUiFillAllLocales('Home', {
    zh: '首页',
    es: 'Inicio',
    pt: 'Início',
    fr: 'Accueil',
    de: 'Start',
    it: 'Home',
    nl: 'Home',
    pl: 'Strona główna',
    tr: 'Ana Sayfa',
    ja: 'ホーム',
    ko: '홈',
    ru: 'Главная',
    uk: 'Головна',
    ar: 'الرئيسية',
    hi: 'होम',
    vi: 'Trang chủ',
    th: 'หน้าแรก',
    id: 'Beranda',
    ms: 'Laman utama',
  }),
  '/products': amzUiFillAllLocales('Products', {
    zh: '商品',
    es: 'Productos',
    pt: 'Produtos',
    fr: 'Produits',
    de: 'Produkte',
    it: 'Prodotti',
    nl: 'Producten',
    pl: 'Produkty',
    tr: 'Ürünler',
    ja: '商品',
    ko: '상품',
    ru: 'Товары',
    uk: 'Товари',
    ar: 'المنتجات',
    hi: 'उत्पाद',
    vi: 'Sản phẩm',
    th: 'สินค้า',
    id: 'Produk',
    ms: 'Produk',
  }),
  '/reviews': amzUiFillAllLocales('Reviews', {
    zh: '评测',
    es: 'Reseñas',
    pt: 'Análises',
    fr: 'Avis',
    de: 'Bewertungen',
    it: 'Recensioni',
    nl: 'Reviews',
    pl: 'Recenzje',
    tr: 'İncelemeler',
    ja: 'レビュー',
    ko: '리뷰',
    ru: 'Обзоры',
    uk: 'Огляди',
    ar: 'مراجعات',
    hi: 'समीक्षाएँ',
    vi: 'Đánh giá',
    th: 'รีวิว',
    id: 'Ulasan',
    ms: 'Ulasan',
  }),
  '/guides': amzUiFillAllLocales('Guides', {
    zh: '指南',
    es: 'Guías',
    pt: 'Guias',
    fr: 'Guides',
    de: 'Ratgeber',
    it: 'Guide',
    nl: 'Gidsen',
    pl: 'Poradniki',
    tr: 'Rehberler',
    ja: 'ガイド',
    ko: '가이드',
    ru: 'Гайды',
    uk: 'Гайди',
    ar: 'أدلة',
    hi: 'गाइड',
    vi: 'Hướng dẫn',
    th: 'คู่มือ',
    id: 'Panduan',
    ms: 'Panduan',
  }),
  '/about': amzUiFillAllLocales('About', {
    zh: '关于',
    es: 'Acerca de',
    pt: 'Sobre',
    fr: 'À propos',
    de: 'Über uns',
    it: 'Chi siamo',
    nl: 'Over',
    pl: 'O nas',
    tr: 'Hakkında',
    ja: '概要',
    ko: '소개',
    ru: 'О нас',
    uk: 'Про нас',
    ar: 'حول',
    hi: 'परिचय',
    vi: 'Giới thiệu',
    th: 'เกี่ยวกับ',
    id: 'Tentang',
    ms: 'Tentang',
  }),
}

export type AmzSearchCopyFns = {
  resultsFor: (n: number, q: string) => string
  articlesHeading: (n: number) => string
}

export type AmzSearchCopyResolved = {
  title: string
  emptyPrompt: string
  noResultsTitle: string
  noResultsBody: string
  startTitle: string
  startBody: string
  browseReviews: string
  browseGuides: string
} & AmzSearchCopyFns

const SEARCH_TITLE = amzUiFillAllLocales('Search Results', {
  zh: '搜索结果',
  es: 'Resultados de búsqueda',
  pt: 'Resultados da pesquisa',
  fr: 'Résultats de recherche',
  de: 'Suchergebnisse',
  it: 'Risultati di ricerca',
  nl: 'Zoekresultaten',
  pl: 'Wyniki wyszukiwania',
  tr: 'Arama sonuçları',
  ja: '検索結果',
  ko: '검색 결과',
  ru: 'Результаты поиска',
  uk: 'Результати пошуку',
  ar: 'نتائج البحث',
  hi: 'खोज परिणाम',
  vi: 'Kết quả tìm kiếm',
  th: 'ผลการค้นหา',
  id: 'Hasil pencarian',
  ms: 'Keputusan carian',
})

const SEARCH_EMPTY_PROMPT = amzUiFillAllLocales(
  'Enter a search term to find reviews and guides, or browse collections below.',
  {
    zh: '输入关键词搜索评测与指南，或浏览下方入口。',
    es: 'Introduce un término para buscar reseñas y guías, o navega por las colecciones.',
    pt: 'Introduza um termo para encontrar análises e guias, ou navegue pelas coleções.',
    fr: 'Saisissez un terme pour trouver avis et guides, ou parcourez les collections ci-dessous.',
    de: 'Suchbegriff eingeben für Bewertungen und Ratgeber oder unten stöbern.',
    it: 'Inserisci un termine per trovare recensioni e guide, o scorri le raccolte.',
    nl: 'Voer een zoekterm in voor reviews en gidsen, of blader hieronder.',
    pl: 'Wpisz frazę, by znaleźć recenzje i poradniki, lub przejrzyj poniżej.',
    tr: 'İnceleme ve rehber aramak için terim girin veya aşağıdan gezin.',
    ja: 'キーワードでレビューとガイドを検索するか、下の一覧からどうぞ。',
    ko: '검색어를 입력해 리뷰와 가이드를 찾거나 아래를 둘러보세요.',
    ru: 'Введите запрос для поиска обзоров и гайдов или откройте подборки ниже.',
    uk: 'Введіть запит для пошуку оглядів і гайдів або перегляньте добірки нижче.',
    ar: 'أدخل مصطلحًا للبحث عن المراجعات والأدلة أو تصفح العناوين أدناه.',
    hi: 'समीक्षा और गाइड खोजने के लिए शब्द लिखें, या नीचे ब्राउज़ करें।',
    vi: 'Nhập từ khóa để tìm đánh giá và hướng dẫn, hoặc xem mục bên dưới.',
    th: 'พิมพ์คำค้นหาเพื่อดูรีวิวและคู่มือ หรือเลือกจากด้านล่าง',
    id: 'Masukkan kata kunci untuk ulasan dan panduan, atau jelajahi di bawah.',
    ms: 'Masukkan carian untuk ulasan dan panduan, atau layar koleksi di bawah.',
  },
)

const SEARCH_NO_RES_TITLE = amzUiFillAllLocales('No Results Found', {
  zh: '未找到结果',
  es: 'Sin resultados',
  pt: 'Sem resultados',
  fr: 'Aucun résultat',
  de: 'Keine Treffer',
  it: 'Nessun risultato',
  nl: 'Geen resultaten',
  pl: 'Brak wyników',
  tr: 'Sonuç yok',
  ja: '見つかりません',
  ko: '결과 없음',
  ru: 'Ничего не найдено',
  uk: 'Нічого не знайдено',
  ar: 'لا توجد نتائج',
  hi: 'कोई परिणाम नहीं',
  vi: 'Không có kết quả',
  th: 'ไม่พบผลลัพธ์',
  id: 'Tidak ada hasil',
  ms: 'Tiada keputusan',
})

const SEARCH_NO_RES_BODY = amzUiFillAllLocales(
  'Try different keywords or browse reviews and guides.',
  {
    zh: '试试其他关键词，或浏览评测与指南。',
    es: 'Prueba otras palabras o navega por reseñas y guías.',
    pt: 'Experimente outras palavras ou veja análises e guias.',
    fr: 'Essayez d’autres mots-clés ou parcourez avis et guides.',
    de: 'Andere Begriffe versuchen oder Bewertungen und Ratgeber ansehen.',
    it: 'Prova altre parole o sfoglia recensioni e guide.',
    nl: 'Probeer andere woorden of bekijk reviews en gidsen.',
    pl: 'Spróbuj innych słów lub przejrzyj recenzje i poradniki.',
    tr: 'Farklı anahtar kelimeler deneyin veya inceleme ve rehberlere göz atın.',
    ja: '別のキーワードを試すか、レビューとガイドを見てください。',
    ko: '다른 키워드를 시도하거나 리뷰와 가이드를 둘러보세요.',
    ru: 'Попробуйте другие слова или откройте обзоры и гайды.',
    uk: 'Спробуйте інші слова або перегляньте огляди й гайди.',
    ar: 'جرّب كلمات مختلفة أو تصفح المراجعات والأدلة.',
    hi: 'अलग कीवर्ड आज़माएँ या समीक्षा व गाइड देखें।',
    vi: 'Thử từ khóa khác hoặc xem đánh giá và hướng dẫn.',
    th: 'ลองคำอื่น หรือดูรีวิวและคู่มือ',
    id: 'Coba kata lain atau jelajahi ulasan dan panduan.',
    ms: 'Cuba kata kunci lain atau layar ulasan dan panduan.',
  },
)

const SEARCH_START_TITLE = amzUiFillAllLocales('Start Your Search', {
  zh: '开始搜索',
  es: 'Empieza tu búsqueda',
  pt: 'Comece a pesquisar',
  fr: 'Lancez votre recherche',
  de: 'Suche starten',
  it: 'Inizia la ricerca',
  nl: 'Start je zoekopdracht',
  pl: 'Rozpocznij wyszukiwanie',
  tr: 'Aramaya başla',
  ja: '検索を始める',
  ko: '검색 시작',
  ru: 'Начните поиск',
  uk: 'Почніть пошук',
  ar: 'ابدأ البحث',
  hi: 'खोज शुरू करें',
  vi: 'Bắt đầu tìm kiếm',
  th: 'เริ่มค้นหา',
  id: 'Mulai cari',
  ms: 'Mulakan carian',
})

const SEARCH_START_BODY = amzUiFillAllLocales(
  'Search gear, brands, or topics to jump into our latest posts.',
  {
    zh: '搜索装备、品牌或话题，查看站内的文章与推荐。',
    es: 'Busca equipo, marcas o temas para ver nuestras últimas publicaciones.',
    pt: 'Pesquise equipamento, marcas ou tópicos para ver as novidades.',
    fr: 'Recherchez du matériel, des marques ou des sujets pour voir nos derniers articles.',
    de: 'Nach Ausrüstung, Marken oder Themen suchen und Beiträge finden.',
    it: 'Cerca attrezzatura, marchi o argomenti per i nostri ultimi articoli.',
    nl: 'Zoek gear, merken of onderwerpen voor onze nieuwste posts.',
    pl: 'Szukaj sprzętu, marek lub tematów, by zobaczyć najnowsze wpisy.',
    tr: 'Ekipman, marka veya konu arayarak yazılarımıza göz atın.',
    ja: 'ギア・ブランド・トピックで検索し、最新記事を読む。',
    ko: '장비, 브랜드, 주제를 검색해 최신 글을 보세요.',
    ru: 'Ищите снаряжение, бренды или темы — читайте свежие материалы.',
    uk: 'Шукайте спорядження, бренди чи теми — читайте нові матеріали.',
    ar: 'ابحث عن العلامات أو المواضيع أو المعدات لقراءة أحدث المقالات.',
    hi: 'गियर, ब्रांड या विषय खोजकर नई पोस्ट देखें।',
    vi: 'Tìm thiết bị, thương hiệu hoặc chủ đề để xem bài mới.',
    th: 'ค้นหาอุปกรณ์ แบรนด์ หรือหัวข้อเพื่ออ่านโพสต์ล่าสุด',
    id: 'Cari perlengkapan, merek, atau topik untuk posting terbaru.',
    ms: 'Cari kelengkapan, jenama atau topik untuk siaran terkini.',
  },
)

const SEARCH_BROWSE_REVIEWS = amzUiFillAllLocales('Browse All Reviews', {
  zh: '全部评测',
  es: 'Ver todas las reseñas',
  pt: 'Ver todas as análises',
  fr: 'Voir tous les avis',
  de: 'Alle Bewertungen',
  it: 'Tutte le recensioni',
  nl: 'Alle reviews',
  pl: 'Wszystkie recenzje',
  tr: 'Tüm incelemeler',
  ja: 'すべてのレビュー',
  ko: '모든 리뷰 보기',
  ru: 'Все обзоры',
  uk: 'Усі огляди',
  ar: 'تصفح كل المراجعات',
  hi: 'सभी समीक्षाएँ देखें',
  vi: 'Xem mọi đánh giá',
  th: 'ดูรีวิวทั้งหมด',
  id: 'Lihat semua ulasan',
  ms: 'Lihat semua ulasan',
})

const SEARCH_BROWSE_GUIDES = amzUiFillAllLocales('View Buying Guides', {
  zh: '购买指南',
  es: 'Ver guías de compra',
  pt: 'Ver guias de compra',
  fr: 'Voir les guides d’achat',
  de: 'Kaufratgeber ansehen',
  it: 'Guide all’acquisto',
  nl: 'Koopgidsen bekijken',
  pl: 'Poradniki zakupowe',
  tr: 'Satın alma rehberleri',
  ja: '購入ガイドを見る',
  ko: '구매 가이드 보기',
  ru: 'Гайды по покупкам',
  uk: 'Гайди з покупок',
  ar: 'عرض أدلة الشراء',
  hi: 'खरीदारी गाइड देखें',
  vi: 'Xem hướng dẫn mua',
  th: 'ดูคู่มือการซื้อ',
  id: 'Lihat panduan membeli',
  ms: 'Lihat panduan membeli',
})

const searchResultsForEn: (n: number, q: string) => string = (n, q) =>
  n > 0
    ? `Found ${n} result${n !== 1 ? 's' : ''} for "${q}".`
    : `No results found for "${q}".`

const SEARCH_RESULTS_FOR_POS: Partial<Record<AppLocale, (n: number, q: string) => string>> = {
  en: searchResultsForEn,
  zh: (n, q) =>
    n > 0 ? `找到 ${n} 条与「${q}」相关的结果。` : `未找到与「${q}」相关的结果。`,
  es: (n, q) =>
    n > 0 ? `Se encontraron ${n} resultado(s) para «${q}».` : `No hay resultados para «${q}».`,
  pt: (n, q) =>
    n > 0 ? `Encontrados ${n} resultado(s) para «${q}».` : `Sem resultados para «${q}».`,
  fr: (n, q) =>
    n > 0 ? `${n} résultat(s) pour « ${q} ».` : `Aucun résultat pour « ${q} ».`,
  de: (n, q) =>
    n > 0 ? `${n} Treffer für „${q}“.` : `Keine Treffer für „${q}“.`,
  it: (n, q) =>
    n > 0 ? `${n} risultato/i per «${q}».` : `Nessun risultato per «${q}».`,
  nl: (n, q) =>
    n > 0 ? `${n} resultaat/resultaten voor «${q}».` : `Geen resultaten voor «${q}».`,
  pl: (n, q) =>
    n > 0 ? `Znaleziono ${n} wyników dla „${q}”.` : `Brak wyników dla „${q}”.`,
  tr: (n, q) =>
    n > 0 ? `“${q}” için ${n} sonuç bulundu.` : `“${q}” için sonuç yok.`,
  ja: (n, q) =>
    n > 0 ? `「${q}」の結果 ${n} 件` : `「${q}」に一致する結果はありません。`,
  ko: (n, q) =>
    n > 0 ? `“${q}” 검색 결과 ${n}개` : `“${q}”에 대한 결과가 없습니다.`,
  ru: (n, q) =>
    n > 0 ? `Найдено результатов: ${n} по запросу «${q}».` : `Нет результатов по «${q}».`,
  uk: (n, q) =>
    n > 0 ? `Знайдено результатів: ${n} за запитом «${q}».` : `Немає результатів для «${q}».`,
  ar: (n, q) =>
    n > 0 ? `تم العثور على ${n} نتيجة لـ «${q}».` : `لا توجد نتائج لـ «${q}».`,
  hi: (n, q) =>
    n > 0 ? `“${q}” के लिए ${n} परिणाम मिले।` : `“${q}” के लिए कोई परिणाम नहीं।`,
  vi: (n, q) =>
    n > 0 ? `Tìm thấy ${n} kết quả cho “${q}”.` : `Không có kết quả cho “${q}”.`,
  th: (n, q) =>
    n > 0 ? `พบ ${n} ผลลัพธ์สำหรับ “${q}”` : `ไม่พบผลลัพธ์สำหรับ “${q}”`,
  id: (n, q) =>
    n > 0 ? `Ditemukan ${n} hasil untuk “${q}”.` : `Tidak ada hasil untuk “${q}”.`,
  ms: (n, q) =>
    n > 0 ? `Ditemui ${n} hasil untuk “${q}”.` : `Tiada hasil untuk “${q}”.`,
}

function resultsForLocale(locale: AppLocale, defaultPublicLocale: AppLocale, n: number, q: string): string {
  const fn =
    SEARCH_RESULTS_FOR_POS[locale] ??
    SEARCH_RESULTS_FOR_POS[defaultPublicLocale] ??
    searchResultsForEn
  return fn(n, q)
}

const SEARCH_ARTICLES_HEADING = amzUiFillAllLocales('Articles ({count})', {
  zh: '文章（{count}）',
  es: 'Artículos ({count})',
  pt: 'Artigos ({count})',
  fr: 'Articles ({count})',
  de: 'Artikel ({count})',
  it: 'Articoli ({count})',
  nl: 'Artikelen ({count})',
  pl: 'Artykuły ({count})',
  tr: 'Yazılar ({count})',
  ja: '記事（{count}）',
  ko: '글 ({count})',
  ru: 'Статьи ({count})',
  uk: 'Статті ({count})',
  ar: 'مقالات ({count})',
  hi: 'लेख ({count})',
  vi: 'Bài viết ({count})',
  th: 'บทความ ({count})',
  id: 'Artikel ({count})',
  ms: 'Artikel ({count})',
})

export function resolveAmzSearchPageCopy(
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
): AmzSearchCopyResolved {
  const p = (m: Partial<Record<AppLocale, string>>) => pickUiString(locale, defaultPublicLocale, m)
  return {
    title: p(SEARCH_TITLE),
    emptyPrompt: p(SEARCH_EMPTY_PROMPT),
    noResultsTitle: p(SEARCH_NO_RES_TITLE),
    noResultsBody: p(SEARCH_NO_RES_BODY),
    startTitle: p(SEARCH_START_TITLE),
    startBody: p(SEARCH_START_BODY),
    browseReviews: p(SEARCH_BROWSE_REVIEWS),
    browseGuides: p(SEARCH_BROWSE_GUIDES),
    resultsFor: (n, q) => resultsForLocale(locale, defaultPublicLocale, n, q),
    articlesHeading: (n) =>
      applyUiTemplate(p(SEARCH_ARTICLES_HEADING), { count: n }),
  }
}
