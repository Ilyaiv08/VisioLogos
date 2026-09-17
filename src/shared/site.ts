export const SITE = 'https://visiologos.ru'
export const SITE_MIRROR = 'https://visiologos.online'

export const SITE_NAME = 'visiologos.ru'

export const SITE_MODULES = `${SITE}/modules`

export function siteHosts(): string[] {

  const custom =
    typeof process !== 'undefined' ? process.env?.VL_SITE?.trim() : undefined
  return custom ? [custom.replace(/\/+$/, '')] : [SITE, SITE_MIRROR]
}

export const cataloguePath = (): string => '/data/modules.json'

export const modulePath = (id: string): string =>
  `/download/module/${encodeURIComponent(id)}.zip`

export function isOurSite(url: string): boolean {
  try {
    const where = new URL(url)
    if (where.protocol !== 'https:' && where.protocol !== 'http:') return false
    const host = where.hostname.replace(/^www\./, '')
    return (
      host === 'visiologos.ru' ||
      host === 'visiologos.online' ||
      host === 'localhost' ||
      host === '127.0.0.1'
    )
  } catch {
    return false
  }
}

const LANGS: Record<string, string> = {
  ru: 'Русский',
  en: 'English',
  uk: 'Українська',
  be: 'Беларуская',
  bg: 'Български',
  sr: 'Српски',
  cu: 'Церковнославянский',
  cs: 'Čeština',
  pl: 'Polski',
  de: 'Deutsch',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
  sv: 'Svenska',
  hu: 'Magyar',
  lv: 'Latviešu',
  et: 'Eesti',
  el: 'Ελληνικά',
  la: 'Latina',
  he: 'עברית',
  ko: '한국어',
  vi: 'Tiếng Việt',
  ky: 'Кыргызча',
  uz: "O'zbek"
}

export const langName = (code: string): string => LANGS[code] ?? code.toUpperCase()

export interface SiteModule {
  id: string
  name: string
  short: string
  kind: 'bible' | 'commentary' | 'dictionary' | 'book'
  lang: string
  books: number
  chapters: number
  old: boolean
  new: boolean
  apocrypha: boolean
  strong: boolean
  copyright: string
  bytes: number
  files: number
}

export interface SiteCatalogue {
  builtAt: number
  modules: SiteModule[]
}
