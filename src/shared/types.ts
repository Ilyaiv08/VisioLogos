export type Testament = 'ot' | 'nt' | 'apocrypha'

export type BibleClass = 'all' | Testament

export interface BibleBook {

  index: number

  name: string

  abbrev: string[]
  testament: Testament
  chapters: number
}

export interface TranslationMeta {

  id: string

  name: string

  shortName: string
  copyright?: string
  hasStrongs: boolean
  books: BibleBook[]

  verseCount: number
}

export interface StoredTranslation {
  meta: TranslationMeta
  text: string[][][]
}

export interface VerseRef {
  book: number
  chapter: number
  verse: number
}

export interface Passage {
  translationId: string
  book: number
  chapter: number
  from: number
  to: number
}

export interface PassageText extends Passage {
  bookName: string

  reference: string
  verses: { n: number; html: string; plain: string }[]
}

export interface SearchHit {
  book: number
  bookName: string
  chapter: number
  verse: number
  reference: string
  plain: string
}

export type SlideKind = 'bible' | 'text' | 'song' | 'blank' | 'countdown'

export interface SlideStyle {
  fontFamily: string

  fontSizeVh: number
  minFontSizeVh: number

  fitToScreen?: boolean

  maxFontSizeVh?: number
  color: string
  align: 'left' | 'center' | 'right'

  shadow: boolean
  bold: boolean
  uppercase: boolean
  lineHeight: number

  paddingPct: number
  showReference: boolean

  referenceScale: number

  referenceFormat: 'full' | 'short' | 'latin'

  showVerseNumbers: boolean

  dividers: boolean
}

export type Background =
  | { kind: 'color'; color: string }

  | { kind: 'gradient'; css: string }

  | { kind: 'image'; src: string; fit?: 'cover' | 'contain' }
  | { kind: 'video'; src: string }

export interface BackgroundItem {
  id: string

  name: string

  nameKey?: string

  builtin: boolean

  tone?: 'dark' | 'light'
  background: Background
}

export interface SlideTemplate {
  id: string
  name: string
  style: SlideStyle
  background: Background
}

export interface SlideBlock {
  html: string
  verse?: number

  scale?: number

  clock?: boolean
}

export interface Countdown {

  endsAt: number

  caption: string

  finishedText: string
}

export interface SlideTail {
  kind: 'more' | 'end'

  label?: string
}

export interface Slide {
  id: string
  kind: SlideKind

  blocks: SlideBlock[]

  reference?: string

  secondary?: { blocks: SlideBlock[]; reference?: string }
  countdown?: Countdown

  vertical?: 'top' | 'center' | 'bottom'

  plate?: 'dark' | 'light'

  tail?: SlideTail
  background: Background
  style: SlideStyle
}

export interface LowerThird {
  text: string
}

export interface StageInfo {

  nextTitle: string | null
  nextLines: string[]

  startedAt: number | null
}

export interface KaraokeLook {
  color: string

  colors?: string[]

  ms: number
}

export interface LiveState {
  slide: Slide | null
  lowerThird: LowerThird | null
  stage: StageInfo

  karaoke: number | null

  karaokeWord: number | null

  karaokeLook: KaraokeLook
  blackout: boolean
  hideText: boolean

  revision: number
}

export type TextKind =
  | 'announcement'
  | 'quote'
  | 'sermon'
  | 'list'
  | 'blank'
  | 'countdown'

export interface TextItem {
  id: string

  deletedAt?: number
  kind: TextKind

  title: string

  body: string

  caption: string

  folderId?: string | null

  style: Partial<SlideStyle> | null
  background: Background | null

  asLowerThird: boolean

  countdownMinutes: number

  free?: FreeLine[]

  freeVertical?: 'top' | 'center' | 'bottom'

  freePlate?: 'none' | 'dark' | 'light'

  numbered?: boolean

  perSlide?: number
  updatedAt: number
}

export interface FreeLine {
  text: string

  scale: number

  clock?: boolean
}

export type SongPartKind =
  | 'verse'
  | 'chorus'
  | 'prechorus'
  | 'bridge'
  | 'tag'
  | 'ending'

export interface SongPart {
  id: string
  kind: SongPartKind

  number: number | null

  text: string
}

export interface Song {
  id: string

  deletedAt?: number
  title: string
  author: string

  number: string

  key: string

  tempo: number | null
  tags: string[]

  folderId?: string | null

  ccli: string
  parts: SongPart[]

  order: string[]

  background?: Background | null
  updatedAt: number

  playCount: number
  lastPlayedAt: number | null
}

export type TreeScope = 'service' | 'song' | 'text'

export interface TreeFolder {
  id: string
  scope: TreeScope

  parentId: string | null
  name: string
  createdAt: number
}

export interface Deck {
  id: string
  name: string

  source: string

  kind?: 'slides' | 'photos'

  slides: string[]

  file?: string
  createdAt: number
}

export type ServiceItemKind = 'song' | 'text' | 'bible' | 'deck' | 'note'

export interface ServiceItem {
  id: string
  kind: ServiceItemKind

  refId: string | null

  bible: {
    translationId: string
    book: number
    chapter: number
    from: number
    to: number
  } | null

  title: string

  note: boolean
}

export interface ServiceFolder {
  id: string

  deletedAt?: number
  title: string

  date: string

  folderId?: string | null
  items: ServiceItem[]
  createdAt: number
  updatedAt: number
}

export type TrashKind = 'song' | 'text' | 'service'

export interface TrashEntry {
  kind: TrashKind
  id: string

  title: string

  count: number

  deletedAt: number | null
}

export type OutputRole = 'hall' | 'stage' | 'stream'

export interface DisplayInfo {
  id: number
  label: string

  bounds: { x: number; y: number; width: number; height: number }

  resolution: { width: number; height: number }

  scaleFactor: number
  isPrimary: boolean

  isControl: boolean

  assignedRole: OutputRole | null
}

export interface OutputWindowInfo {
  role: OutputRole
  displayId: number
  open: boolean

  windowed: boolean
}

export interface CatalogTab {
  id: string
  name: string
}

export interface CatalogSong extends Song {
  tabId: string
}
