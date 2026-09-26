import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importBibleQuoteModule } from '../src/main/bible/bqParser'
import { buildBookIndex, formatReference, parseReference, parseReferenceList } from '../src/shared/refs'
import { freeBlocks, planSlides, DEFAULT_STYLE } from '../src/shared/slide'
import { childrenOf, freeName, isInside, newFolder, pathOf, subtree } from '../src/shared/tree'
import { deckSlides, deckSlideUrl } from '../src/shared/decks'
import {
  bareName,
  extensionOf,
  folderOf,
  isDeckFile,
  isImageFile,
  photoGroups,
  splitDropped
} from '../src/shared/drop'
import { LANGS, plural as pluralForm, setLang, t, tn } from '../src/shared/i18n'
import { ru } from '../src/shared/i18n/ru'
import { en } from '../src/shared/i18n/en'
import { dropIndex, reorder } from '../src/shared/service'
import { isNewer, looksLikeInstaller, weighUpdate } from '../src/shared/update'
import { binOf, toTrash } from '../src/main/bin'
import type { JsonFile } from '../src/main/jsonFile'
import type { BibleBook, SongPartKind, Testament } from '../src/shared/types'
import { canonAbbrevs, canonOf, CANON_SIZE, groupOf, inCanonOrder } from '../src/shared/bookGroups'
import {
  defaultScreen,
  fallbackScreen,
  isRole,
  movable,
  previewScreen,
  restorePlan,
  ROLES,
  screenAspect,
  screenLabel,
  showsWindowed
} from '../src/shared/screens'
import {
  DEFAULT_THEME,
  FAMILIES,
  isChrome,
  isTheme,
  NIGHT_CHROME,
  THEMES
} from '../src/shared/themes'
import {
  defaultOrder,
  emptySong,
  importedName,
  markRepeats,
  movedBefore,
  numberFromName,
  parseSongText,
  partLabel,
  partsFromBlocks,
  placedAt,
  renumbered,
  songOrder,
  withKind
} from '../src/shared/songs'
import {
  cleanCategories,
  countIn,
  defaultCategories,
  freeCategoryName,
  KIDS,
  mergeCatalog,
  movedCategory,
  placedCategory,
  REVIVAL,
  sameSong,
  songsIn,
  titleKey
} from '../src/shared/categories'
import type { DisplayInfo, Song } from '../src/shared/types'
import { backgroundFromXml } from '../src/shared/pptxTheme'
import { readableStyleOn } from '../src/shared/backgrounds'
import { normalizeTranslatorTag, toPlain } from '../src/shared/text'
import { isOurSite, langName, modulePath, siteHosts, SITE, SITE_NAME } from '../src/shared/site'
import { importSongFile } from '../src/main/songImport'
import {
  DWELL,
  followFrom,
  hear,
  normalizeWord,
  phrasesOf,
  plainLine,
  QUIET,
  slips,
  spellWith,
  tapeOf,
  tokensOf,
  vocabularyFromFst,
  vocabularyFromText,
  type Follow,
  type Step,
  type Tape
} from '../src/shared/singAlong'
import { pptxBackground } from '../src/main/pptxMedia'
import { zipSync } from 'fflate'
import {
  legacyStorageName,
  packTranslation,
  storageName,
  unpackTranslation
} from '../src/shared/bibleFile'
import { pro6, pro7 } from './proPresenterFixtures'
import { toOpenLyrics, toOpenSong, toPlainText } from '../src/shared/songExport'
import { pptxOfSongs, songSlides } from '../src/main/pptx'
import {
  BUILTIN_BACKGROUNDS,
  colorForLuminance,
  flatLuminance,
  readableOn,
  readableTextColor,
  shadowHex,
  textShadowCss
} from '../src/shared/backgrounds'
import {
  countItems,
  listBlocks,
  listSections,
  listTitle,
  MAX_ITEMS,
  packItems,
  rawSections,
  writeSections
} from '../src/shared/textList'

let failures = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  const modulesDir = join(process.cwd(), 'modules')
  const entries = (await readdir(modulesDir, { withFileTypes: true })).filter((e) =>
    e.isDirectory()
  )

  if (entries.length === 0) {
    console.log('В папке modules/ нет ни одного модуля.')
    process.exit(1)
  }

  for (const entry of entries) {
    console.log(`\n=== Модуль ${entry.name} ===`)
    const { translation, warnings } = await importBibleQuoteModule(
      join(modulesDir, entry.name),
      entry.name
    )
    const { meta, text } = translation

    console.log(
      `${meta.name} — книг ${meta.books.length}, глав ` +
        `${text.reduce((a, b) => a + b.length, 0)}, стихов ${meta.verseCount}`
    )
    for (const w of warnings) console.log(`  ! ${w}`)

    const emptyChapters = text.flatMap((book, b) =>
      book.flatMap((chapter, c) => (chapter.length === 0 ? [`${b + 1}:${c + 1}`] : []))
    )
    check('нет пустых глав', emptyChapters.length === 0, emptyChapters.slice(0, 5).join(', '))

    const emptyVerses = text.flatMap((book, b) =>
      book.flatMap((chapter, c) =>
        chapter.flatMap((verse, v) => (toPlain(verse) ? [] : [`${b + 1}:${c + 1}:${v + 1}`]))
      )
    )
    check('нет пустых стихов', emptyVerses.length === 0, emptyVerses.slice(0, 5).join(', '))

    const leftovers = text.flatMap((book) =>
      book.flatMap((chapter) => chapter.filter((v) => /<(?!\/?[jt]\b)[^>]+>|&\w+;/.test(v)))
    )
    check('не осталось лишней разметки', leftovers.length === 0, leftovers[0]?.slice(0, 80))

    const wholeVerseItalics = text.flatMap((book) =>
      book.flatMap((chapter) =>
        chapter.filter((v) => normalizeTranslatorTag(v).startsWith('<t>') && v.trim().endsWith('</t>') && !normalizeTranslatorTag(v).slice(3).includes('</t>'))
      )
    )
    check(
      'нет стихов, целиком набранных курсивом',
      wholeVerseItalics.length === 0,
      `осталось ${wholeVerseItalics.length}`
    )

    const psalm = normalizeTranslatorTag(text[18]?.[21]?.[0] ?? '')
    check('Пс. 22:1 больше не курсив целиком', !psalm.startsWith('<t>'), psalm.slice(0, 50))

    const partial = normalizeTranslatorTag('слово <t>добавлено</t> тут')
    check('частичный курсив сохраняется', partial.includes('<t>'), partial)

    const index = buildBookIndex(meta.books)
    const john = parseReference('Ин 3:16', index)
    check('«Ин 3:16» разобрано', john?.chapter === 3 && john?.from === 16)

    if (john) {

      const bookMeta = meta.books[john.book - 1]
      const verse = toPlain(text[john.book - 1][john.chapter - 1][john.from! - 1])
      check(
        'Ин 3:16 ведёт в Евангелие от Иоанна',
        bookMeta.abbrev.some((a) => /^Jn\.?$/i.test(a)),
        bookMeta.name
      )
      check('Ин 3:16 — непустой стих про Бога', /Бог/.test(verse), verse.slice(0, 60))
    }

    const byLatin = (abbrev: string): number | undefined =>
      meta.books.find((b) =>
        b.abbrev.some((a) => a.replace(/\.$/, '').toLowerCase() === abbrev.toLowerCase())
      )?.index

    for (const [input, latin, tail] of [
      ['1Кор 13:4-7', '1Co', '13:4-7'],
      ['1 Кор. 13, 4', '1Co', '13:4'],
      ['Пс 22', 'Ps', '22'],
      ['Быт 1:1', 'Ge', '1:1'],
      ['ин3:16', 'Jn', '3:16'],
      ['От Иоанна 3:16', 'Jn', '3:16'],
      ['ИН 3:16-18', 'Jn', '3:16-18'],
      ['Откр 22:20', 'Rev', '22:20']
    ] as const) {
      const wantBook = byLatin(latin)
      if (!wantBook) {
        check(`«${input}»: в модуле нет книги ${latin}`, false)
        continue
      }
      const expect = `${meta.books[wantBook - 1].abbrev[0] ?? '?'} ${tail}`
      const ref = parseReference(input, index)
      const got =
        ref && ref.book === wantBook
          ? formatReference(meta.books[ref.book - 1].abbrev[0] ?? '?', ref.chapter, ref.from, ref.to)
          : ref
            ? `не та книга: ${meta.books[ref.book - 1]?.name}`
            : 'null'
      check(`«${input}» → ${expect}`, got === expect, got)
    }

    check('мусор не считается адресом', parseReference('в начале было слово', index) === null)

    const list = parseReferenceList('Ин 3:16; Рим 5:8, 10\nПс 22', index)
    check('список из четырёх адресов', list.length === 4, `получено ${list.length}`)
    check(
      'продолжение «, 10» осталось в Римлянам 5',
      list[2]?.chapter === 5 && list[2]?.from === 10
    )

    const short = planSlides([{ n: 16, html: text[42]?.[2]?.[15] ?? 'текст' }], DEFAULT_STYLE)
    check('короткий стих — один слайд', short.length === 1, `слайдов ${short.length}`)

    const longChapter = (text[18]?.[117] ?? []).map((html, i) => ({ n: i + 1, html }))
    if (longChapter.length > 0) {
      const many = planSlides(longChapter, DEFAULT_STYLE)
      check('Пс. 118 — 176 стихов', longChapter.length === 176, `стихов ${longChapter.length}`)
      check('Пс. 118 целиком режется на слайды', many.length > 1, `слайдов ${many.length}`)
      check(
        'номер стиха стоит только на первой части разрезанного стиха',
        many.every((slide) => slide.blocks.filter((b) => b.verse !== undefined).length <= slide.blocks.length)
      )
      check(
        'ни один слайд не потерял текст',
        many.every((s) => s.blocks.every((b) => toPlain(b.html).length > 0))
      )
      const before = longChapter.map((v) => toPlain(v.html)).join(' ').replace(/\s+/g, '')
      const after = many
        .flatMap((s) => s.blocks)
        .map((b) => toPlain(b.html))
        .join(' ')
        .replace(/\s+/g, '')
      check('при разбиении текст не потерялся', before === after)

      const seen = new Map<number, number>()
      for (const slide of many) {
        for (const n of new Set(slide.verses)) seen.set(n, (seen.get(n) ?? 0) + 1)
      }
      const torn = [...seen]
        .filter(([, count]) => count > 1)
        .map(([n]) => n)
        .filter((n) => {

          const own = many.filter((slide) => slide.verses.includes(n))
          return !own.every((slide) => slide.verses.every((v) => v === n))
        })
      check(
        'ни один стих не разорван между слайдами',
        torn.length === 0,
        torn.slice(0, 5).join(', ')
      )
    }

    const canonBooks = meta.books.filter((b) => b.testament !== 'apocrypha')
    const unknown = canonBooks.filter((b) => canonOf(b) === null)
    check(
      'все канонические книги узнаны по латинскому сокращению',
      unknown.length === 0,
      unknown.map((b) => b.name).slice(0, 5).join(', ')
    )

    const ordered = inCanonOrder(canonBooks)
    const at = (name: RegExp): number => ordered.findIndex((b) => name.test(b.name))
    const acts = at(/Деян/)
    const james = at(/Иаков/)
    const romans = at(/Римлянам/)
    const hebrews = at(/Евреям/)
    const revelation = at(/Откровение/)

    check('Соборные послания идут сразу за «Деяниями»', james === acts + 1, `${acts} → ${james}`)
    check('Послания Павла — после Соборных', romans > james, `Иакова ${james}, Рим ${romans}`)
    check('«К Евреям» закрывает послания Павла', hebrews === revelation - 1, String(hebrews))
    check(
      '«Откровение» — последняя книга',
      revelation === ordered.length - 1,
      `${revelation} из ${ordered.length - 1}`
    )
    check('порядок ничего не потерял', ordered.length === canonBooks.length)
    check(
      'номера книг переменой мест не тронуты',
      ordered.every((b) => meta.books[b.index - 1] === b)
    )
  }

  checkBookOrder()
  checkSongs()
  checkSongRepeats()
  checkSongNumbers()
  checkCategories()
  checkImportNames()
  checkSingAlong()
  checkDeckBackground()
  checkBibleFile()
  await checkSongImport()
  checkSongExport()
  checkTitleSlide()
  checkTextList()
  checkBackgrounds()
  checkFreeSlide()
  checkTree()
  checkDecks()
  checkPartKind()
  checkDragDrop()
  checkI18n()
  checkScreens()
  checkScreenPicker()
  checkThemeBackground()
  await checkMenus()
  await checkTrash()
  await checkOutputWindows()
  await checkThemes()

  console.log(failures === 0 ? '\nВсё в порядке.' : `\nПроблем: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

function checkBookOrder(): void {
  console.log('\n=== Порядок книг ===')

  const all = canonAbbrevs()
  const twice = all.filter((a, i) => all.indexOf(a) !== i)
  check('ни одно сокращение не занято дважды', twice.length === 0, twice.join(', '))
  check('в каноне шестьдесят шесть книг', CANON_SIZE === 66, String(CANON_SIZE))

  const book = (index: number, name: string, abbrev: string[], testament: Testament): BibleBook => ({
    index,
    name,
    abbrev,
    testament,
    chapters: 1
  })

  const western = [
    book(1, 'Деяния', ['Деян.', 'Ac'], 'nt'),
    book(2, 'К Римлянам', ['Рим.', 'Ro'], 'nt'),
    book(3, 'К Евреям', ['Евр.', 'Heb'], 'nt'),
    book(4, 'Иакова', ['Иак.', 'Jas'], 'nt'),
    book(5, 'Откровение', ['Откр.', 'Rev'], 'nt')
  ]
  const fixed = inCanonOrder(western).map((b) => b.name)
  check(
    'Соборные встают перед Павловыми',
    fixed.join(' · ') === 'Деяния · Иакова · К Римлянам · К Евреям · Откровение',
    fixed.join(' · ')
  )

  check('«К Евреям» — послание Павла', groupOf(western[2], 66) === 'paul', groupOf(western[2], 66))
  check('«Иакова» — соборное', groupOf(western[3], 66) === 'general', groupOf(western[3], 66))

  const withStranger = [...western, book(6, 'Книга Еноха', ['Ен.'], 'nt')]
  check(
    'модуль с незнакомой книгой не трогаем',
    inCanonOrder(withStranger).map((b) => b.name).join(' · ') ===
      withStranger.map((b) => b.name).join(' · ')
  )

  const withApocrypha = [
    book(1, 'Товит', ['Тов.'], 'apocrypha'),
    book(2, 'Откровение', ['Откр.', 'Rev'], 'nt'),
    book(3, 'Иудифь', ['Иудифь'], 'apocrypha'),
    book(4, 'Деяния', ['Деян.', 'Ac'], 'nt')
  ]
  const mixed = inCanonOrder(withApocrypha).map((b) => b.name)
  check(
    'неканонические уходят в конец своим порядком',
    mixed.join(' · ') === 'Деяния · Откровение · Товит · Иудифь',
    mixed.join(' · ')
  )
  check('у неканонической книги места в каноне нет', canonOf(withApocrypha[0]) === null)

  check('пустой список не ломает разбор', inCanonOrder([]).length === 0)
}

function checkDecks(): void {
  console.log('\n=== Презентации ===')

  const deck = {
    id: 'deck-1',
    name: 'Проповедь',
    source: 'Проповедь.pdf',
    slides: ['001.png', '002.png'],
    createdAt: 0
  }
  const slides = deckSlides(deck, DEFAULT_STYLE)

  check('слайдов столько же, сколько картинок', slides.length === 2)
  check('поверх картинки ничего не пишем', slides.every((s) => s.blocks.length === 0))
  check(
    'слайд вписывается целиком, а не обрезается',
    slides.every((s) => s.background.kind === 'image' && s.background.fit === 'contain')
  )
  check(
    'адрес ведёт в папку презентации',
    deckSlideUrl('deck-1', '001.png') === 'visio://deck/deck-1/001.png',
    deckSlideUrl('deck-1', '001.png')
  )

  check(
    'имя с пробелом закодировано',
    deckSlideUrl('deck 1', 'слайд 1.png') === 'visio://deck/deck%201/%D1%81%D0%BB%D0%B0%D0%B9%D0%B4%201.png',
    deckSlideUrl('deck 1', 'слайд 1.png')
  )
}

function checkTree(): void {
  console.log('\n=== Дерево папок ===')

  const year = newFolder('service', '2026', null)
  const august = newFolder('service', 'Август', year.id)
  const july = newFolder('service', 'Июль', year.id)
  const week = newFolder('service', '24 августа', august.id)
  const songs = newFolder('song', 'Прославление', null)
  const all = [year, august, july, week, songs]

  check('в корне одна папка служений', childrenOf(all, 'service', null).length === 1)
  check(
    'чужая область не мешается',
    childrenOf(all, 'song', null).length === 1 && childrenOf(all, 'song', null)[0].name === 'Прославление'
  )
  check(
    'соседи по алфавиту',
    childrenOf(all, 'service', year.id).map((f) => f.name).join(', ') === 'Август, Июль',
    childrenOf(all, 'service', year.id).map((f) => f.name).join(', ')
  )
  check(
    'путь от корня',
    pathOf(all, week.id).map((f) => f.name).join(' / ') === '2026 / Август / 24 августа',
    pathOf(all, week.id).map((f) => f.name).join(' / ')
  )

  check('вложенность видна', isInside(all, week.id, year.id))
  check('наоборот — нет', !isInside(all, year.id, week.id))
  check('сама в себе', isInside(all, year.id, year.id))

  const loop = [
    { ...year, parentId: august.id },
    { ...august, parentId: year.id }
  ]
  check('петля в данных не зацикливает', pathOf(loop, year.id).length <= 2)

  check(
    'в поддереве сама папка и три вложенные',
    subtree(all, year.id).length === 4,
    `${subtree(all, year.id).length}`
  )
  check('соседнее дерево не задето', !subtree(all, year.id).includes(songs.id))

  check('имя занято — берётся следующее', freeName(all, 'service', year.id, 'Август') === 'Август 2')
  check('свободное имя не трогаем', freeName(all, 'service', year.id, 'Сентябрь') === 'Сентябрь')
}

function checkFreeSlide(): void {
  console.log('\n=== Свободный слайд ===')

  const blocks = freeBlocks([
    { text: 'Тишина, идёт причастие', scale: 1.7 },
    { text: '   ', scale: 1 },
    { text: '', scale: 1, clock: true },
    { text: 'Просим не выходить из зала', scale: 1 }
  ])

  check('пустая строка выброшена', blocks.length === 3, `${blocks.length}`)
  check('часы остались, хоть текста в них и нет', blocks[1]?.clock === true)
  check('размер строки сохранён', blocks[0]?.scale === 1.7, String(blocks[0]?.scale))
  check(
    'угловые скобки обезврежены',
    freeBlocks([{ text: '<b>ой</b>', scale: 1 }])[0].html.includes('&lt;b&gt;')
  )
  check('без строк слайд пустой — только фон', freeBlocks([]).length === 0)
}

function checkBackgrounds(): void {
  console.log('\n=== Фоны ===')

  const find = (id: string): (typeof BUILTIN_BACKGROUNDS)[number] => {
    const item = BUILTIN_BACKGROUNDS.find((b) => b.id === id)
    if (!item) throw new Error(`нет встроенного фона «${id}»`)
    return item
  }

  const white = find('white').background
  const night = find('night').background

  check('белый фон есть', BUILTIN_BACKGROUNDS.some((b) => b.id === 'white'))
  check(
    'светлых фонов не меньше шести',
    BUILTIN_BACKGROUNDS.filter((b) => b.tone === 'light').length >= 6
  )

  check('у каждого фона указано, тёмный он или светлый', BUILTIN_BACKGROUNDS.every((b) => b.tone))
  check(
    'подпись совпадает с яркостью',
    BUILTIN_BACKGROUNDS.every(
      (b) => readableTextColor(b.background) === (b.tone === 'light' ? '#111111' : '#ffffff')
    ),
    BUILTIN_BACKGROUNDS.filter(
      (b) => readableTextColor(b.background) !== (b.tone === 'light' ? '#111111' : '#ffffff')
    )
      .map((b) => b.name)
      .join(', ')
  )

  const textured = ['paper', 'parchment'].map((id) => find(id).background)
  check(
    'текстура записана ссылкой data:',
    textured.every((bg) => bg.kind === 'gradient' && bg.css.includes('data:image/svg+xml,%3Csvg'))
  )
  check(
    'в ссылке нет решётки',
    textured.every(
      (bg) => bg.kind === 'gradient' && !/data:image\/svg\+xml,[^"]*#/.test(bg.css)
    )
  )
  check('на белом текст тёмный', readableTextColor(white) === '#111111')
  check('на «Ночи» текст белый', readableTextColor(night) === '#ffffff', String(readableTextColor(night)))

  const on = (color: string, bg: (typeof BUILTIN_BACKGROUNDS)[number]['background']): boolean =>
    readableOn(color, flatLuminance(bg) ?? 0)

  check('белое на белом не читается', !on('#ffffff', white))
  check('тёмное на белом читается', on('#111111', white))
  check('белое на тёмном читается', on('#ffffff', night))
  check('тёмное на «Ночи» не читается', !on('#111111', night))

  check('яркость картинки отсюда не берётся', flatLuminance({ kind: 'image', src: 'x.jpg' }) === null)

  const grey = flatLuminance({ kind: 'color', color: '#808080' }) ?? 0
  check('средний серый — это 0.22, а не 0.5', grey > 0.19 && grey < 0.25, grey.toFixed(3))
  check('на среднем сером текст остаётся белым', colorForLuminance(grey) === '#ffffff')

  check('на тёмной фотографии тёмный текст не годится', !on('#111111', 0.12))
  check('на тёмной фотографии белый текст годится', on('#ffffff', 0.12))

  check('под белым текстом тень тёмная', textShadowCss('#ffffff').includes('rgba(0,0,0'))
  check('под тёмным текстом тень светлая', textShadowCss('#111111').includes('rgba(255,255,255'))
  check('в презентации так же', shadowHex('#ffffff') === '000000' && shadowHex('#111111') === 'FFFFFF')
  check('непонятный цвет — тень как была', textShadowCss('красный').includes('rgba(0,0,0'))

  check(
    'светлая заливка не темнеет от виньетки',
    readableTextColor(find('parchment').background) === '#111111'
  )
}

function checkTextList(): void {
  console.log('\n=== Благодарности и нужды ===')

  const body = [
    'Благодарности:',
    '1. За исцеление сестры Марии',
    '— За благополучную поездку братьев',
    '',
    'Молитвенные нужды:',
    '• О здоровье брата Петра',
    'О работе для семьи Ивановых'
  ].join('\n')

  const sections = listSections(body)
  check('разделов два', sections.length === 2, `${sections.length}`)
  check('пунктов всего четыре', countItems(body) === 4, `${countItems(body)}`)
  check(
    'заголовки без двоеточия',
    sections[0]?.heading === 'Благодарности' && sections[1]?.heading === 'Молитвенные нужды',
    sections.map((s) => s.heading).join(' | ')
  )
  check(
    'чужая метка снята',
    sections[0].items[0] === 'За исцеление сестры Марии' &&
      sections[1].items[0] === 'О здоровье брата Петра',
    sections[0].items.join(' | ')
  )
  check(
    'длинная строка с двоеточием — пункт, а не заголовок',
    listSections('О том, что предстоит нашей общине этой осенью и зимой:')[0].heading === ''
  )
  check('год в начале строки не принят за метку', listSections('2026 год')[0].items[0] === '2026 год')

  const parts = rawSections(body)
  check('раздела для правки два', parts.length === 2, `${parts.length}`)
  check(
    'пункты вернулись строками',
    parts[0].text === 'За исцеление сестры Марии\nЗа благополучную поездку братьев',
    parts[0].text
  )
  check('запись и чтение сходятся', countItems(writeSections(parts)) === 4)
  check(
    'пустая заготовка открывается с двумя разделами',
    rawSections('').map((p) => p.heading).join(' и ') === 'Благодарности и Молитвенные нужды'
  )
  check('название по разделам', listTitle(body) === 'Благодарности и молитвенные нужды', listTitle(body))

  const many = Array.from({ length: 15 }, (_, i) => `Нужда ${i + 1}`)
  const packed = packItems(many, () => true, MAX_ITEMS)
  check('длинный список разложен по слайдам', packed.length === 3, `${packed.length}`)
  check(
    'пункты не потерялись и не повторились',
    packed.flat().length === 15 && new Set(packed.flat()).size === 15
  )

  const stubborn = packItems(many, () => false, MAX_ITEMS)
  check('пункт кладётся даже когда не влезает', stubborn.length === 15, `${stubborn.length}`)

  const seven = Array.from({ length: 7 }, (_, i) => `Нужда ${i + 1}`)
  const spread = packItems(seven, (items) => items.length <= 5, MAX_ITEMS)
  check(
    'пункты разведены поровну',
    spread.length === 2 && spread[0].length === 4 && spread[1].length === 3,
    spread.map((s) => s.length).join('+')
  )

  const blocks = listBlocks('Молитвенные нужды', ['О работе для брата'], true, 6)
  check('заголовок стоит первым', blocks[0]?.html.includes('Молитвенные нужды') === true)
  check('нумерация сквозная', blocks[1]?.html.includes('>7.<') === true, blocks[1]?.html)
  check(
    'угловые скобки в пункте обезврежены',
    listBlocks('', ['<b>ой</b>'], false, 0)[0].html.includes('&lt;b&gt;')
  )
}

function checkPartKind(): void {
  console.log('\n=== Смена вида части ===')

  const parts = [
    { id: 'a', kind: 'verse' as const, number: 1, text: 'раз' },
    { id: 'b', kind: 'verse' as const, number: 2, text: 'два' },
    { id: 'c', kind: 'verse' as const, number: 3, text: 'три' },
    { id: 'd', kind: 'verse' as const, number: 4, text: 'четыре' }
  ]

  const after = withKind(parts, 'b', 'chorus')
  check('вид сменился', after[1].kind === 'chorus')
  check('у припева номера нет', after[1].number === null)
  check(
    'куплеты перенумерованы подряд',
    after.filter((p) => p.kind === 'verse').map((p) => p.number).join('') === '123',
    after.map((p) => `${p.kind}${p.number ?? ''}`).join(' ')
  )
  check('текст не тронут', after.map((p) => p.text).join(' ') === 'раз два три четыре')

  const back = withKind(after, 'b', 'verse')
  check('вернулся куплетом под номером 2', back[1].kind === 'verse' && back[1].number === 2)
  check('всего куплетов снова четыре', back.every((p) => p.kind === 'verse'))
  check('чужой id ничего не портит', withKind(parts, 'нет такого', 'bridge').length === 4)
}

function checkSongs(): void {
  console.log('\n=== Разбор песни ===')

  const source = [
    'Куплет 1',
    'Хвалу воспеть желаю я',
    'Тебе, мой Царь и Бог',
    '',
    'Припев:',
    'Свят, свят, свят Господь',
    'Вся земля полна Твоей славы',
    '',
    '2.',
    'Ты сотворил и день и ночь',
    'И звёзды в вышине',
    '',
    'Бридж',
    'Достоин Ты хвалы'
  ].join('\n')

  const parts = parseSongText(source)

  check('частей разобрано четыре', parts.length === 4, `получено ${parts.length}`)
  check('первый куплет опознан', parts[0]?.kind === 'verse' && parts[0]?.number === 1)
  check('припев опознан', parts[1]?.kind === 'chorus', parts[1]?.kind)
  check('«2.» — это второй куплет', parts[2]?.kind === 'verse' && parts[2]?.number === 2)
  check('бридж опознан', parts[3]?.kind === 'bridge', parts[3]?.kind)

  const firstLines = parts.map((p) => p.text.split('\n')[0])
  check(
    'заголовок не попал в текст',
    firstLines.every((line) => !/^(куплет|припев|бридж|\d+\.)\s*$/i.test(line)),
    firstLines.join(' | ')
  )
  check(
    'строки внутри части сохранены',
    parts[0]?.text.split('\n').length === 2,
    String(parts[0]?.text.split('\n').length)
  )

  const label = (id: string): string => partLabel(parts.find((x) => x.id === id)!)
  const order = defaultOrder(parts).map(label).join('-')
  check('порядок по умолчанию — 1-П-2-П-Б-П', order === '1-П-2-П-Б-П', order)

  const plain = parseSongText('Первая строка\nВторая строка\n\nТретья строка')
  check(
    'без заголовков получаются куплеты',
    plain.length === 2 && plain[1].number === 2,
    `частей ${plain.length}`
  )

  const empty = parseSongText('   \n\n   ')
  check('пустой текст не даёт частей', empty.length === 0, String(empty.length))

  const slides = partsFromBlocks([
    ['Хвалу воспеть желаю я', 'Тебе, мой Царь и Бог', '', 'И буду петь всегда'],
    ['Припев:', 'Свят, свят, свят Господь'],
    ['Куплет 2'],
    ['Ты сотворил и день и ночь']
  ])

  check('слайдов четыре, а частей три', slides.length === 3, `частей ${slides.length}`)
  check(
    'пустая строка внутри слайда часть не разрывает',
    slides[0]?.text.split('\n').length === 3,
    String(slides[0]?.text.split('\n').length)
  )
  check('припев со своего слайда опознан', slides[1]?.kind === 'chorus', slides[1]?.kind)
  check(
    'слайд из одного заголовка — подпись к следующему',
    slides[2]?.kind === 'verse' &&
      slides[2]?.number === 2 &&
      slides[2]?.text === 'Ты сотворил и день и ночь',
    `${slides[2]?.kind} ${slides[2]?.number}`
  )
  check('куплеты нумеруются подряд', slides[0]?.number === 1, String(slides[0]?.number))

  const withRepeat: [string, SongPartKind][] = [
    ['Припев: (2 раза)', 'chorus'],
    ['Припев (2 раза)', 'chorus'],
    ['Припев 2 раза', 'chorus'],
    ['Припев: (х2)', 'chorus'],
    ['Припев x2', 'chorus'],
    ['Chorus (twice)', 'chorus'],
    ['Куплет 2 (2 раза)', 'verse'],
    ['Бридж (тихо)', 'bridge']
  ]
  for (const [label, kind] of withRepeat) {
    const [part] = partsFromBlocks([[label, 'строка песни']])
    check(
      `«${label}» — заголовок, а не текст`,
      part?.kind === kind && part?.text === 'строка песни',
      `${part?.kind} · ${JSON.stringify(part?.text)}`
    )
  }

  for (const line of ['Припев мой — Господь', 'Куплет наш о любви', 'Припевом станет песнь']) {
    const [part] = partsFromBlocks([[line, 'вторая строка']])
    check(`строка песни цела: «${line}»`, part?.text.startsWith(line), part?.text)
  }
}

function checkSongRepeats(): void {
  console.log('\n=== Припев по повторам ===')

  const chorus = ['Свят, свят, свят Господь', 'Вся земля полна славы']
  const slides = [
    ['Хвалу воспеть желаю я', 'Тебе, мой Царь и Бог'],
    chorus,
    ['Ты сотворил и день и ночь', 'И звёзды в вышине'],

    ['свят свят свят господь', 'вся земля полна славы'],
    ['Достоин Ты один хвалы', 'Во веки и всегда']
  ]

  const parts = partsFromBlocks(slides)
  check('слайдов столько же, сколько было', parts.length === 5, String(parts.length))
  check(
    'повторяющийся слайд стал припевом',
    parts[1]?.kind === 'chorus' && parts[3]?.kind === 'chorus',
    `${parts[1]?.kind} · ${parts[3]?.kind}`
  )
  check(
    'припев не удалён и не склеен',
    parts[1]?.text !== parts[3]?.text && parts[3]?.text.startsWith('свят'),
    parts[3]?.text
  )
  check(
    'куплеты пронумерованы подряд',
    parts.filter((p) => p.kind === 'verse').map((p) => p.number).join(',') === '1,2,3',
    parts.map((p) => `${p.kind}${p.number ?? ''}`).join(' ')
  )

  const order = defaultOrder(parts)
  check('порядок пения — как в песне', order.length === 5, String(order.length))
  check(
    'ни одна часть из порядка не выпала',
    new Set(order).size === parts.length,
    `${new Set(order).size} из ${parts.length}`
  )

  const plain = partsFromBlocks([
    ['Первый куплет песни', 'вторая его строка'],
    ['Второй куплет песни', 'и его вторая строка'],
    ['Третий куплет песни', 'и снова другая строка']
  ])
  check('без повторов припева не появляется', plain.every((p) => p.kind === 'verse'))

  const marked = partsFromBlocks([
    ['Припев:', 'Свят Господь'],
    ['Свят Господь'],
    ['Свят Господь']
  ])
  check(
    'размеченную песню повторы не трогают',
    marked[0]?.kind === 'chorus' && marked[1]?.kind === 'verse',
    marked.map((p) => p.kind).join(' ')
  )

  const allSame = partsFromBlocks([['Аллилуйя Господу слава'], ['Аллилуйя Господу слава']])
  check(
    'песня из одного повторённого текста припевом не становится',
    allSame.every((p) => p.kind === 'verse'),
    allSame.map((p) => p.kind).join(' ')
  )

  const shortOnes = partsFromBlocks([['Да'], ['Нет'], ['Да'], ['Длинная строка песни про']])
  check('на коротком совпадении не гадаем', shortOnes.every((p) => p.kind === 'verse'))

  check('пустой список не ломает разбор', markRepeats([]).length === 0)
}

function checkSongNumbers(): void {
  console.log('\n=== Номера песен ===')

  const named: [string, string, string][] = [
    ['01 Свят Господь', '1', 'Свят Господь'],
    ['002 Свят Господь', '2', 'Свят Господь'],
    ['12. Свят Господь', '12', 'Свят Господь'],
    ['7) Свят Господь', '7', 'Свят Господь'],
    ['003 - Свят Господь', '3', 'Свят Господь']
  ]
  for (const [name, number, title] of named) {
    const got = numberFromName(name)
    check(
      `«${name}» — номер ${number}`,
      got.number === number && got.title === title,
      `${got.number} · ${got.title}`
    )
  }

  for (const name of ['10 заповедей', 'Псалом 22', '1000 имён Твоих']) {
    const got = numberFromName(name)
    check(`«${name}» — название целиком`, got.number === '' && got.title === name, got.title)
  }

  const song = (id: string, number: string, title: string): Song => ({
    ...emptySong(),
    id,
    number,
    title
  })

  const library = [
    song('c', '', 'Аллилуйя'),
    song('a', '2', 'Благодарю'),
    song('b', '1', 'Свят Господь')
  ].sort(songOrder)

  check(
    'пронумерованные идут первыми и по номеру',
    library.map((s) => s.id).join('') === 'bac',
    library.map((s) => `${s.number || '—'}:${s.title}`).join(' ')
  )

  check(
    'номера раздаются подряд',
    renumbered(['a', 'b', 'c'])
      .map((x) => x.number)
      .join(',') === '1,2,3'
  )

  check(
    'песня встаёт на свой номер',
    placedAt(['a', 'b', 'c', 'd'], 'd', 2).join('') === 'adbc',
    placedAt(['a', 'b', 'c', 'd'], 'd', 2).join('')
  )
  check('номер меньше первого — в начало', placedAt(['a', 'b'], 'b', 0).join('') === 'ba')
  check(
    'номер больше последнего — в конец',
    placedAt(['a', 'b', 'c'], 'a', 99).join('') === 'bca'
  )

  check('перенос мышью ставит перед строкой', movedBefore(['a', 'b', 'c', 'd'], 'd', 'a').join('') === 'dabc')
  check('бросок в конец ряда', movedBefore(['a', 'b', 'c'], 'a', null).join('') === 'bca')
  check('бросок на саму себя ничего не ломает', movedBefore(['a', 'b'], 'a', 'a').join('') === 'ab')
}

function checkImportNames(): void {
  console.log('\n=== Имя и номер песни при ввозе ===')

  const pptx = importedName('4. Церковь Божия', { title: 'ЦЕРКОВЬ БОЖИЯ', number: '' })
  check(
    '«4. Церковь Божия.pptx»: номер 4 из имени файла, а не пропал',
    pptx.number === '4',
    JSON.stringify(pptx)
  )
  check(
    'название как у файла, а не заглавными со слайда',
    pptx.title === 'Церковь Божия',
    JSON.stringify(pptx)
  )

  const ppt = importedName('1. День! Какое чудо! День! Я 2 (2)', {
    title: '1. День! Какое чудо! День! Я 2 (2)',
    number: ''
  })
  check(
    '«.ppt» по-прежнему: номер 1 и название из имени файла',
    ppt.number === '1' && ppt.title === 'День! Какое чудо! День! Я 2 (2)',
    JSON.stringify(ppt)
  )

  const plain = importedName('Благодарности и молитвенные нужды', {
    title: 'БЛАГОДАРНОСТИ',
    number: ''
  })
  check(
    'файл без номера остаётся без номера, имя — как у файла',
    plain.number === '' && plain.title === 'Благодарности и молитвенные нужды',
    JSON.stringify(plain)
  )

  const numbers = ['1. А', '2. Б', '3. В', '4. Г'].map(
    (name) => importedName(name, { title: 'СЛАЙД', number: '' }).number
  )
  check('номера идут подряд, как в папке', numbers.join() === '1,2,3,4', numbers.join())

  check(
    'безликое имя файла уступает названию со слайда',
    importedName('Презентация1', { title: 'Великий Бог', number: '' }).title === 'Великий Бог'
  )
  check(
    'и «Новая песня (3)» тоже',
    importedName('Новая песня (3)', { title: 'Великий Бог', number: '' }).title === 'Великий Бог'
  )

  const lyrics = importedName('12. export', { title: 'Великий Бог', number: '' }, true)
  check(
    'OpenLyrics: название из самого файла, номер — из имени',
    lyrics.title === 'Великий Бог' && lyrics.number === '12',
    JSON.stringify(lyrics)
  )
  check(
    'номер из имени файла главнее записанного внутри',
    importedName('3. Песня', { title: 'Песня', number: '9' }).number === '3'
  )
  check(
    'нет номера в имени — берём записанный внутри',
    importedName('Песня', { title: 'Песня', number: '77' }).number === '77'
  )
  check(
    'обычное название со словом «песня» безликим не считается',
    importedName('Песня о любви', { title: 'ЛЮБОВЬ', number: '' }).title === 'Песня о любви'
  )
  check(
    '«Презентация Microsoft PowerPoint» — безликое имя',
    importedName('Презентация Microsoft PowerPoint', { title: 'Слава', number: '' }).title === 'Слава'
  )
  check(
    'номер в названии со слайда тоже не теряется',
    importedName('Презентация2', { title: '5. Слава', number: '' }).number === '5'
  )
}

function checkCategories(): void {
  console.log('\n=== Категории песен ===')

  setLang('ru')
  const list = defaultCategories()
  check('категорий изначально три', list.length === 3, String(list.length))
  check('первая — «Песни Возрождения»', list[0].name === 'Песни Возрождения', list[0].name)
  check('вторая — для старшей группы', list[1].name === 'Песни для старшей группы', list[1].name)
  check('третья — для детской группы', list[2].name === 'Песни для детской группы', list[2].name)
  check('у категорий разные ключи', new Set(list.map((one) => one.id)).size === list.length)

  const song = (id: string, title: string, categoryId: string | null = null, number = ''): Song => ({
    ...emptySong(),
    id,
    title,
    number,
    categoryId
  })
  const songs = [
    song('1', 'Бог велик', REVIVAL, '12'),
    song('2', 'Свет во тьме', KIDS),
    song('3', 'Новая песнь')
  ]

  check('название сравнивается без знаков и регистра', titleKey('Бог велик!') === titleKey('бог  ВЕЛИК'))
  check('«ё» и «е» — одно и то же', titleKey('Свёт') === titleKey('Свет'))
  check('повтор по названию виден', sameSong(songs, 'бог велик')?.id === '1')
  check('тот же номер — тоже повтор', sameSong(songs, 'Бог велик', '12')?.id === '1')
  check('другой номер — другая песня', sameSong(songs, 'Бог велик', '13') === null)
  check('сама себя повтором не считает', sameSong(songs, 'Бог велик', '', '1') === null)
  check('пустое название повтором не считается', sameSong(songs, '   ') === null)

  check(
    'открытая категория показывает только свои песни',
    songsIn(songs, list, KIDS).map((one) => one.id).join() === '2'
  )
  check(
    'вне категорий видны только песни без категории',
    songsIn(songs, list, null).map((one) => one.id).join() === '3'
  )
  check(
    'песня из удалённой категории не теряется',
    songsIn([song('9', 'Сирота', 'cat-нет')], list, null).length === 1
  )
  check('песни в категории считаются', countIn(songs, REVIVAL) === 1)

  const moved = movedCategory(list, list[2].id, -1)
  check('категория переставляется', moved[1].id === list[2].id, moved.map((one) => one.name).join(' | '))
  check('за край не уезжает', movedCategory(list, list[0].id, -1) === list)
  check(
    'перетащили вниз — встала на место той, на которую бросили',
    placedCategory(list, list[0].id, list[2].id).map((one) => one.id).join() ===
      [list[1].id, list[2].id, list[0].id].join()
  )
  check(
    'перетащили вверх — встала перед ней',
    placedCategory(list, list[2].id, list[0].id).map((one) => one.id).join() ===
      [list[2].id, list[0].id, list[1].id].join()
  )
  check('бросили на саму себя — порядок тот же', placedCategory(list, list[1].id, list[1].id) === list)
  check('занятое имя не повторяется', freeCategoryName(list, list[0].name) === `${list[0].name} 2`)
  check('свободное имя не трогаем', freeCategoryName(list, 'Рождественские') === 'Рождественские')
  check(
    'мусор из файла отбрасывается',
    cleanCategories([{ id: 'a', name: 'А' }, { id: 'a', name: 'Б' }, { id: '', name: 'В' }, null, 5])
      .length === 1
  )

  const old = {
    tabs: [
      { id: 'tab-revival', name: 'Песни возрождения' },
      { id: 'tab-kids', name: 'Детские' },
      { id: 'tab-elder', name: 'Старшие' },
      { id: 'tab-777', name: 'Рождество' }
    ],
    songs: [
      { ...song('c1', 'В дизайне Божьем'), tabId: 'tab-revival' },
      { ...song('c2', 'Свет во тьме'), tabId: 'tab-elder' },
      { ...song('c3', 'Новая песнь'), tabId: 'tab-777' },
      { ...song('c4', 'Звезда'), tabId: 'tab-777' }
    ]
  }
  const merged = mergeCatalog(songs, [], old, 1000)
  check(
    'после переноса категорий четыре',
    merged.categories.length === 4,
    merged.categories.map((one) => one.name).join(' | ')
  )
  check('имена по умолчанию — новые', merged.categories[0].name === 'Песни Возрождения')
  check('своя вкладка каталога стала категорией', merged.categories[3]?.name === 'Рождество')
  check('новые песни каталога перенесены', merged.added === 2, String(merged.added))

  const brought = merged.items.find((one) => one.title === 'В дизайне Божьем')
  check('песня легла в «Песни Возрождения»', brought?.categoryId === REVIVAL, String(brought?.categoryId))
  check('у перенесённой песни ключ библиотеки', brought?.id.startsWith('song-') === true, brought?.id)
  check('поле вкладки не перенесено', brought !== undefined && !('tabId' in brought))
  check(
    'песня, что была и там и там, не раздвоилась',
    merged.items.filter((one) => titleKey(one.title) === titleKey('Свет во тьме')).length === 1
  )
  check('своя категория у песни не сменилась', merged.items.find((one) => one.id === '2')?.categoryId === KIDS)
  check(
    'песня без категории получила категорию из каталога',
    merged.items.find((one) => one.id === '3')?.categoryId === 'tab-777' && merged.tagged === 1
  )
  check(
    'и новая песня из своей вкладки — тоже',
    merged.items.find((one) => one.title === 'Звезда')?.categoryId === 'tab-777'
  )
  check('повторный перенос ничего не добавляет', mergeCatalog(merged.items, merged.categories, old, 2000).added === 0)

  const fresh = mergeCatalog([], [], null, 1)
  check('без старого каталога — просто три категории', fresh.categories.length === 3 && fresh.items.length === 0)
  check(
    'битый каталог ничего не ломает',
    mergeCatalog(songs, [], { songs: [null as never, { tabId: 'x' } as never] }, 1).added === 0
  )
}

function checkDeckBackground(): void {
  console.log('\n=== Фон презентации ===')

  const big = new Uint8Array(90_000).fill(7)
  const small = new Uint8Array(4_000).fill(3)

  const rels = (target: string): Uint8Array =>
    new TextEncoder().encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="${target}"/></Relationships>`
    )

  const deck = zipSync({
    'ppt/media/image1.png': small,
    'ppt/media/image2.jpeg': big,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels('../media/image2.jpeg'),
    'ppt/slides/_rels/slide1.xml.rels': rels('../media/image1.png')
  })

  const found = pptxBackground(Buffer.from(deck))
  check('фон взят из образца слайдов', found?.data.length === big.length, String(found?.data.length))
  check('«.jpeg» пишется как «.jpg»', found?.ext === '.jpg', found?.ext)

  const orphan = zipSync({ 'ppt/media/image1.png': big })
  check('картинка без ссылок фоном не считается', pptxBackground(Buffer.from(orphan)) === null)

  const tiny = zipSync({
    'ppt/media/image1.png': small,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels('../media/image1.png')
  })
  check('логотип фоном не считается', pptxBackground(Buffer.from(tiny)) === null)

  check('чужой файл не ломает разбор', pptxBackground(Buffer.from('не zip')) === null)
}

function checkSingAlong(): void {
  console.log('\n=== Листание по голосу ===')

  check('разметка из строки убрана', plainLine('<i>Свят</i> Господь') === 'Свят Господь')
  check(
    'слова строки без знаков, дефис внутри слова остаётся',
    tokensOf('«Господь — моя сила», кто-то!').join(' ') === 'господь моя сила кто-то',
    tokensOf('«Господь — моя сила», кто-то!').join(' ')
  )
  check('«ё» сравнивается как «е»', normalizeWord('Моё!') === 'мое')

  const known = new Set(['моё', 'твоё', 'сердце', 'кто-то', 'бог', 'отец', 'идёт', 'все', 'всё'])
  check('«мое» написано без точек — слышим «моё»', spellWith(known, 'мое').join() === 'моё')
  check('«идет» тоже', spellWith(known, 'идет').join() === 'идёт')
  check('знакомое слово остаётся как есть', spellWith(known, 'сердце').join() === 'сердце')
  check('«все» и «всё» не путаются', spellWith(known, 'все').join() === 'все')
  check('слово с дефисом целиком', spellWith(known, 'кто-то').join() === 'кто-то')
  check('незнакомое слово с дефисом — по частям', spellWith(known, 'бог-отец').join(' ') === 'бог отец')
  check('незнакомое слово модуль не услышит', spellWith(known, 'агнцу').length === 0)

  const vocabulary = vocabularyFromText('<eps> 0\n!SIL 1\n[unk] 2\nбог 3\nмоё 4\n')
  check(
    'словарь из words.txt без служебных слов',
    vocabulary.size === 2 && vocabulary.has('бог') && vocabulary.has('моё'),
    [...vocabulary].join(' ')
  )

  const fst = fakeFst(['<eps>', '!SIL', '[unk]', 'господь', 'моё', 'сердце'])
  const fromFst = vocabularyFromFst(fst)
  check(
    'словарь прочитан из заголовка Gr.fst',
    fromFst?.size === 3 && fromFst.has('господь') && fromFst.has('моё'),
    fromFst ? [...fromFst].join(' ') : 'null'
  )
  check('чужой файл словарём не считается', vocabularyFromFst(new Uint8Array(64)) === null)
  check('обрезанный файл ничего не ломает', vocabularyFromFst(fst.subarray(0, 60)) === null)

  const grammar = JSON.parse(phrasesOf([['свят', 'свят'], ['бог'], ['свят', 'свят'], []]))
  check('в словаре распознавания строки без повторов и «[unk]»', grammar.join('|') === 'свят свят|бог|[unk]')

  check('одна потерянная буква прощается длинному слову', slips('вседержител', 'вседержитель', 2) === 1)
  check('короткому слову не прощается ничего', slips('дом', 'дар', 0) > 0)

  const song = [
    ['Господь моя сила и щит', 'На Него уповает сердце моё'],
    ['Буду петь Ему новую песнь', 'И славить имя Его вовеки'],
    ['Свят свят свят Господь Бог', 'Вся земля полна славы Его'],
    ['Аллилуйя аллилуйя', 'Слава Тебе Господь']
  ]
  const tape = tapeFrom(song)

  check('слайдов четыре', tape.slides.length === 4)
  check(
    'сигнал к переходу — последнее слово слайда',
    tape.words[tape.slides[0].cue].norm === 'мое',
    tape.words[tape.slides[0].cue]?.norm
  )
  check('ворота — начало последней строки', tape.slides[0].gate === 5, String(tape.slides[0].gate))

  const words = (text: string): string[] => tokensOf(text)
  const verse = words('господь моя сила и щит на него уповает сердце моё')

  let run = sing(tape, followFrom(tape, 0, 0), verse, 0, 400)
  check(
    'переход ровно на последнем слове, а не раньше',
    run.turns.length === 1 && run.turns[0].word === 'моё' && run.turns[0].to === 1,
    JSON.stringify(run.turns)
  )
  check('после перехода ведём уже второй слайд', run.state.slide === 1 && run.state.at === tape.slides[1].from)

  run = sing(tape, followFrom(tape, 0, 0), words('господь сила уповает моё'), 0, 500)
  check(
    'пропущенные слова не мешают: переход на последнем',
    run.turns.length === 1 && run.turns[0].word === 'моё',
    JSON.stringify(run.turns)
  )

  run = sing(tape, followFrom(tape, 0, 0), words('господь моё'), 0, 900)
  check('последнее слово не к месту — перехода нет', run.turns.length === 0, JSON.stringify(run.turns))

  run = sing(tape, followFrom(tape, 0, 0), verse, 0, 100)
  check('слишком быстро — перехода по последнему слову нет', run.turns.length === 0)
  run = sing(tape, run.state, words('буду петь ему новую'), 1000, 300)
  check(
    'но стоит запеть следующий слайд — он включается',
    run.turns.length === 1 && run.turns[0].to === 1 && run.turns[0].word === 'петь',
    JSON.stringify(run.turns)
  )

  const twice = tapeFrom(song, [2])
  run = sing(twice, followFrom(twice, 0, 0), verse, 0, 400)
  check(
    'слайд поют дважды: после первого раза остаёмся',
    run.turns.length === 0 && run.agains.length === 1 && run.state.pass === 1,
    JSON.stringify({ turns: run.turns, agains: run.agains })
  )
  run = sing(twice, run.state, verse, 5000, 400)
  check(
    'после второго раза — переход',
    run.turns.length === 1 && run.turns[0].word === 'моё' && run.turns[0].to === 1,
    JSON.stringify(run.turns)
  )

  run = sing(twice, followFrom(twice, 0, 0), verse, 0, 100)
  run = sing(twice, run.state, verse, 2000, 400)
  check(
    'первый раз пропели мимо ушей — второй всё равно засчитан',
    run.turns.length === 1 && run.turns[0].to === 1,
    JSON.stringify({ turns: run.turns, agains: run.agains })
  )

  run = sing(tape, followFrom(tape, 0, 0), verse, 0, 400)
  run = sing(tape, run.state, words('сердце моё моё'), 4000, 200)
  check('хвост прошлого слайда не возвращает назад', run.jumps.length === 0 && run.state.slide === 1)

  run = sing(tape, followFrom(tape, 1, 0), words('вовеки'), 0, 400)
  check('последнее слово в самом начале слайда — не переход', run.turns.length === 0)

  run = sing(tape, followFrom(tape, 0, 0), ['[unk]', 'и', 'на', 'а'], 0, 400)
  check('шум и короткие слова пропускаются', run.state.at === 0 && run.state.stray.length === 0)

  run = sing(tape, followFrom(tape, 0, 0), words('свят свят свят господь бог вся земля полна славы'), 0, 400)
  check(
    'перепрыгнули через слайд — программа догоняет',
    run.state.slide === 2 && run.jumps.some((one) => one.to === 2) && !run.turns.some((one) => one.to === 1),
    JSON.stringify({ turns: run.turns, jumps: run.jumps, slide: run.state.slide })
  )

  const deaf = tapeOf([
    {
      times: 1,
      lines: [
        [hearable('ликуй'), hearable('душа'), hearable('моя')],
        [hearable('поёт'), hearable('агнцу'), { norm: 'хвалу', hear: false }]
      ]
    },
    { times: 1, lines: [[hearable('второй'), hearable('слайд')]] }
  ])
  check('незнакомое модулю слово сигналом не бывает', deaf.words[deaf.slides[0].cue].norm === 'агнцу')
  run = sing(deaf, followFrom(deaf, 0, 0), words('ликуй душа моя поёт агнцу'), 0, 400)
  check('переход на последнем слове, которое модуль знает', run.turns.length === 1 && run.turns[0].word === 'агнцу')

  const long = tapeFrom(
    Array.from({ length: 40 }, (_, i) => [
      `Строка номер ${i} первая песня славная`,
      `Вторая строка слайда ${i} поётся громко`
    ])
  )
  const pool = long.words.map((one) => one.norm)
  let seed = 7
  const random = (): number => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  let state = followFrom(long, 0, 0)
  const started = performance.now()
  for (let i = 0; i < 4000; i++) {
    state = hear(long, state, [pool[Math.floor(random() * pool.length)]], i * 250).state
  }
  const spent = performance.now() - started
  check('4000 случайных слов на длинной песне — быстро', spent < 1500, `${Math.round(spent)} мс`)

  check('пауза после перехода не короче задержки', QUIET >= DWELL)
}

function hearable(word: string): { norm: string; hear: boolean } {
  return { norm: normalizeWord(word), hear: true }
}

function tapeFrom(slides: string[][], times: number[] = []): Tape {
  return tapeOf(
    slides.map((lines, i) => ({
      times: times[i] ?? 1,
      lines: lines.map((line) => tokensOf(line).map(hearable))
    }))
  )
}

function sing(
  tape: Tape,
  from: Follow,
  words: string[],
  start: number,
  gap: number
): {
  state: Follow
  turns: { to: number; word: string }[]
  jumps: { to: number; word: string }[]
  agains: { pass: number; word: string }[]
} {
  let state = from
  const turns: { to: number; word: string }[] = []
  const jumps: { to: number; word: string }[] = []
  const agains: { pass: number; word: string }[] = []

  words.forEach((word, i) => {
    const result: { state: Follow; step: Step } = hear(tape, state, [word], start + i * gap)
    state = result.state
    if (result.step.kind === 'turn') turns.push({ to: result.step.to, word })
    if (result.step.kind === 'jump') jumps.push({ to: result.step.to, word })
    if (result.step.kind === 'again') agains.push({ pass: result.step.pass, word })
  })

  return { state, turns, jumps, agains }
}

function fakeFst(symbols: string[]): Uint8Array {
  const parts: number[] = []
  const int32 = (value: number): void => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setInt32(0, value, true)
    parts.push(...b)
  }
  const int64 = (value: number): void => {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigInt64(0, BigInt(value), true)
    parts.push(...b)
  }
  const text = (value: string): void => {
    const b = new TextEncoder().encode(value)
    int32(b.length)
    parts.push(...b)
  }

  int32(2125659606)
  text('ngram')
  text('standard')
  int32(4)
  int32(3)
  int64(0)
  int64(1)
  int64(10)
  int64(0)
  int32(2125658996)
  text('words.txt')
  int64(symbols.length)
  int64(symbols.length)
  symbols.forEach((symbol, i) => {
    text(symbol)
    int64(i)
  })
  return new Uint8Array(parts)
}

function checkBibleFile(): void {
  console.log('\n=== Файл перевода ===')

  const meta = {
    id: 'Введение',
    name: 'Введение в Новый Завет',
    shortName: 'ВНЗ',
    hasStrongs: false,
    books: [],
    verseCount: 3
  }
  const stored = { meta, text: [[['раз', 'два'], ['три']]] }

  const packed = packTranslation(stored)
  const back = unpackTranslation(JSON.parse(JSON.stringify(packed)))
  check('перевод вернулся тем же', back.meta.id === 'Введение' && back.text.length === 1)
  check('стихи пересчитаны, если их не записали', unpackTranslation({ ...packed, verseCount: 0 }).meta.verseCount === 3)

  const old = unpackTranslation({ meta, text: stored.text })
  check('прежняя запись читается', old.meta.id === 'Введение')

  let refused = ''
  try {
    unpackTranslation({ format: 'visiologos-bible', version: 99, text: [], books: [] })
  } catch (error) {
    refused = error instanceof Error ? error.message : ''
  }
  check('файл из будущей версии не читается', /новее|более новой/i.test(refused), refused)

  let alien = ''
  try {
    unpackTranslation({ hello: 'world' })
  } catch (error) {
    alien = error instanceof Error ? error.message : ''
  }
  check('чужой файл переводом не считается', alien.length > 0, alien)

  check(
    'русские названия больше не сталкиваются',
    storageName('Введение') !== storageName('Евангелизм'),
    storageName('Введение') + ' / ' + storageName('Евангелизм')
  )
  check(
    'а прежнее имя их и правда путало',
    legacyStorageName('Введение') === legacyStorageName('Евангелизм')
  )
  check('запрещённое в имени файла убрано', !/[<>:"/\\|?*]/.test(storageName('a<b>c:d')))
  check('пустое имя не даёт пустого файла', storageName('') === '_')
}

async function checkSongImport(): Promise<void> {
  console.log('\n=== Импорт песен ===')

  const groups = [
    { name: 'Куплет 1', slides: ['Великий Бог, когда на мир смотрю я,\nНа всё, что Ты создал'] },
    { name: 'Припев', slides: ['Тогда поёт душа моя, Господь:', 'Как Ты велик!'] },
    { name: 'Куплет 2', slides: ['Когда смотрю на лес, поля и горы'] },
    { name: 'Бридж', slides: ['Достоин Ты хвалы во веки вечные'] }
  ]

  const cases: { name: string; file: string; buf: Buffer; format: string }[] = [
    {
      name: 'ProPresenter 6, русский текст байтами cp1251',
      file: 'Великий Бог.pro6',
      buf: pro6('Великий Бог', groups),
      format: 'ProPresenter 6'
    },
    {
      name: 'ProPresenter 6, текст escape-последовательностями',
      file: 'Великий Бог.pro6',
      buf: pro6('Великий Бог', groups, true),
      format: 'ProPresenter 6'
    },
    {
      name: 'ProPresenter 7, protobuf без схемы',
      file: 'Великий Бог.pro',
      buf: pro7('Великий Бог', groups),
      format: 'ProPresenter 7'
    }
  ]

  const slideXml = (lines: string[]): Uint8Array =>
    new TextEncoder().encode(
      '<?xml version="1.0"?><p:sld><p:cSld><p:spTree>' +
        lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('') +
        '</p:spTree></p:cSld></p:sld>'
    )

  const rels = (target: string): Uint8Array =>
    new TextEncoder().encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="${target}"/></Relationships>`
    )

  const photo = new Uint8Array(120_000).fill(9)
  const logo = new Uint8Array(3_000).fill(1)

  const songDeck = Buffer.from(
    zipSync({
      'ppt/slides/slide1.xml': slideXml(['Куплет 1', 'Великий Бог, когда на мир смотрю я']),
      'ppt/slides/slide2.xml': slideXml(['Припев:', 'Тогда поёт душа моя, Господь']),
      'ppt/media/image1.jpeg': photo,
      'ppt/media/image2.png': logo,
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels('../media/image1.jpeg'),
      'ppt/slides/_rels/slide1.xml.rels': rels('../media/image2.png')
    })
  )

  const fromDeck = importSongFile('Великий Бог.pptx', songDeck)
  check('песня из .pptx разобрана', fromDeck.ok, fromDeck.ok ? '' : fromDeck.reason)
  if (fromDeck.ok) {
    check(
      'слайд с заголовком стал подписью к следующему',
      fromDeck.song.parts.length === 2 &&
        fromDeck.song.parts[0].text === 'Великий Бог, когда на мир смотрю я',
      `частей ${fromDeck.song.parts.length}`
    )
    check('припев со своего слайда опознан', fromDeck.song.parts[1]?.kind === 'chorus')
  }

  const brought = pptxBackground(songDeck)
  check('фон пришёл вместе с песней', brought?.data.length === photo.length, String(brought?.data.length))
  check('логотип общины фоном не стал', brought?.ext === '.jpg', brought?.ext)

  for (const item of cases) {
    const result = importSongFile(item.file, item.buf)
    if (!result.ok) {
      check(item.name, false, result.reason)
      continue
    }

    const order = result.song.order
      .map((id) => partLabel(result.song.parts.find((p) => p.id === id)!))
      .join('-')

    check(
      item.name,
      result.format === item.format &&
        result.song.parts.length === 4 &&
        order === '1-П-2-П-Б-П' &&
        result.song.parts[0].text.startsWith('Великий Бог, когда'),
      `${result.format}, частей ${result.song.parts.length}, порядок ${order}`
    )

    check(
      `${item.name}: слайды группы склеены`,
      result.song.parts[1]?.text.split('\n').length === 2,
      JSON.stringify(result.song.parts[1]?.text)
    )
  }

  const path = join(process.cwd(), 'tools', 'fixtures', 'Великий Бог.pdf')
  const pdf = importSongFile(path, await readFile(path))

  if (!pdf.ok) {
    check('PDF разобран', false, pdf.reason)
    return
  }

  check('PDF: формат опознан', pdf.format === 'PDF', pdf.format)
  check('PDF: название взято из крупной строки', pdf.song.title === 'Великий Бог', pdf.song.title)
  check(
    'PDF: автор взят из строки под названием',
    pdf.song.author.startsWith('Карл Боберг'),
    pdf.song.author
  )
  check('PDF: частей четыре', pdf.song.parts.length === 4, `получено ${pdf.song.parts.length}`)
  check(
    'PDF: часть со второй страницы не приклеилась к первой',
    pdf.song.parts[3]?.kind === 'bridge',
    pdf.song.parts[3]?.kind
  )
  check(
    'PDF: строка аккордов не попала в текст слайда',
    !pdf.song.parts[0].text.includes('Em'),
    JSON.stringify(pdf.song.parts[0]?.text)
  )
  check(
    'PDF: строки куплета целы',
    pdf.song.parts[0]?.text.split('\n').length === 4,
    JSON.stringify(pdf.song.parts[0]?.text)
  )

  const binary = importSongFile('мусор.bin', Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))
  check('двоичный файл не становится песней', !binary.ok, binary.ok ? 'взяли' : binary.reason)

  const empty = importSongFile('пусто.txt', Buffer.from('   \n\n  ', 'utf8'))
  check('пустой файл не становится песней', !empty.ok, empty.ok ? 'взяли' : empty.reason)
}

function checkSongExport(): void {
  console.log('\n=== Экспорт песен ===')

  const source = [
    'Куплет 1',
    'Хвалу воспеть желаю я',
    'Тебе, мой Царь и Бог',
    '',
    'Припев:',
    'Свят, свят, свят Господь',
    '',
    'Куплет 2',
    'Ты сотворил и день и ночь',
    '',
    'Бридж',
    'Достоин Ты хвалы'
  ].join('\n')

  const song = emptySong()
  song.title = 'Хвалу воспеть'
  song.author = 'Иван Проханов'
  song.number = '142'
  song.parts = parseSongText(source)
  song.order = defaultOrder(song.parts)

  const cases: { name: string; file: string; text: string }[] = [
    { name: 'текст', file: 'песня.txt', text: toPlainText(song) },
    { name: 'OpenSong', file: 'песня.xml', text: toOpenSong(song) },
    { name: 'OpenLyrics', file: 'песня.xml', text: toOpenLyrics(song) }
  ]

  const deck = importSongFile(
    'песни.pptx',
    Buffer.from(
      pptxOfSongs(songSlides([song]), {
        style: DEFAULT_STYLE,
        background: null,
        sizes: []
      })
    )
  )
  if (!deck.ok) {
    check('PowerPoint: презентация читается обратно', false, deck.reason)
  } else {
    check(
      'PowerPoint: слайдов столько, сколько поют',
      deck.song.parts.length === song.order.length + 1,
      `частей ${deck.song.parts.length}, в порядке ${song.order.length}`
    )
    check(
      'PowerPoint: первый слайд — название песни',
      deck.song.parts[0].text.startsWith(song.title),
      JSON.stringify(deck.song.parts[0].text)
    )
    check(
      'PowerPoint: строки внутри слайда целы',
      deck.song.parts[1].text.startsWith('Хвалу воспеть желаю я'),
      JSON.stringify(deck.song.parts[1].text)
    )
  }

  for (const item of cases) {
    const back = importSongFile(item.file, Buffer.from(item.text, 'utf8'))
    if (!back.ok) {
      check(`${item.name}: вернулся обратно`, false, back.reason)
      continue
    }

    const order = back.song.order
      .map((id) => partLabel(back.song.parts.find((p) => p.id === id)!))
      .join('-')

    check(
      `${item.name}: части и порядок целы`,
      back.song.parts.length === 4 && order === '1-П-2-П-Б-П',
      `частей ${back.song.parts.length}, порядок ${order}`
    )
    check(
      `${item.name}: название вернулось`,
      back.song.title === song.title,
      back.song.title
    )
    check(
      `${item.name}: строки внутри части целы`,
      back.song.parts[0].text === 'Хвалу воспеть желаю я\nТебе, мой Царь и Бог',
      JSON.stringify(back.song.parts[0].text)
    )
  }
}

function checkTitleSlide(): void {
  console.log('\n=== Титульный слайд ===')

  const song = emptySong()
  song.title = 'Великий Бог'
  song.author = 'Карл Боберг, перевод Ивана Прохановича'
  song.parts = parseSongText(
    [
      'Куплет 1',
      'Великий Бог, когда на мир смотрю я,',
      'На всё, что Ты создал руками Своих рук',
      '',
      'Припев:',
      'Тогда поёт душа моя, Господь',
      '',
      'Куплет 2',
      'Когда смотрю на лес, поля и горы',
      '',
      'Бридж',
      'Достоин Ты хвалы во веки вечные'
    ].join('\n')
  )
  song.order = defaultOrder(song.parts)

  const deck = pptxOfSongs(songSlides([song]), {
    style: DEFAULT_STYLE,
    background: null,
    sizes: []
  })
  const back = importSongFile('Великий Бог.pptx', Buffer.from(deck))

  if (!back.ok) {
    check('презентация с титульным слайдом читается', false, back.reason)
    return
  }

  check(
    'название не стало куплетом',
    back.song.parts.length === song.order.length,
    `частей ${back.song.parts.length}, слайдов в порядке ${song.order.length}`
  )
  check('название взято из титульного слайда', back.song.title === song.title, back.song.title)
  check('автор взят оттуда же', back.song.author === song.author, back.song.author)
  check(
    'первым куплетом стал первый куплет',
    back.song.parts[0]?.text.startsWith('Великий Бог, когда на мир'),
    JSON.stringify(back.song.parts[0]?.text)
  )

  const plain = importSongFile(
    'песня.txt',
    Buffer.from(
      [
        'Великий Бог, когда на мир смотрю я,',
        'На всё, что Ты создал руками Своих рук',
        '',
        'Тогда поёт душа моя, Господь',
        '',
        'Когда смотрю на лес, поля и горы'
      ].join('\n'),
      'utf8'
    )
  )
  check(
    'без титульного слайда первый куплет остаётся куплетом',
    plain.ok && plain.song.parts.length === 3,
    plain.ok ? `частей ${plain.song.parts.length}` : plain.reason
  )
}

function checkDragDrop(): void {
  console.log('\n=== Перетаскивание ===')

  const plan = ['Молитва', 'Песня', 'Проповедь', 'Благословение']
  const move = (from: number, at: number): string[] =>
    reorder(plan, from, dropIndex(from, at))

  check(
    'сверху вниз: перед последней строкой',
    move(0, 3).join(', ') === 'Песня, Проповедь, Молитва, Благословение',
    move(0, 3).join(', ')
  )
  check(
    'сверху вниз: в самый конец',
    move(0, 4).join(', ') === 'Песня, Проповедь, Благословение, Молитва',
    move(0, 4).join(', ')
  )
  check(
    'снизу вверх: в начало',
    move(2, 0).join(', ') === 'Проповедь, Молитва, Песня, Благословение',
    move(2, 0).join(', ')
  )
  check(
    'на своё же место — список не меняется',
    move(1, 1) === plan && move(1, 2) === plan
  )
  check('пункт не потерялся и не размножился', move(0, 4).length === plan.length)
  check('чужой номер строки ничего не ломает', reorder(plan, 9, 0) === plan)

  check(
    '«Ниже» из меню сдвигает ровно на строку',
    reorder(plan, 0, 1).join(', ') === 'Песня, Молитва, Проповедь, Благословение'
  )

  check('расширение берётся в нижнем регистре', extensionOf('C:\\Служения\\Проповедь.PPTX') === 'pptx')
  check('у OpenSong расширения нет вовсе', extensionOf('C:\\Песни\\Великий Бог') === '')
  check('точка в имени папки за расширение не считается', extensionOf('C:\\Песни 2.0\\Хвала') === '')
  check('презентация опознана', isDeckFile('проповедь.pdf') && isDeckFile('слайды.ppt'))
  check('текстовый файл презентацией не считается', !isDeckFile('песня.txt'))

  const split = splitDropped([
    'C:\\Флешка\\Проповедь.pptx',
    'C:\\Флешка\\Схема.pdf',
    'C:\\Флешка\\Объявление.JPG',
    'C:\\Флешка\\Великий Бог.txt',
    'C:\\Флешка\\Хвала'
  ])
  check('презентации отобраны', split.decks.length === 2, split.decks.join(', '))
  check('фотография отобрана', split.photos.length === 1, split.photos.join(', '))
  check(
    'остальное уходит в разбор песни — вместе с файлом без расширения',
    split.songs.length === 2,
    split.songs.join(', ')
  )
  check(
    'ничего не потерялось и не задвоилось',
    split.decks.length + split.photos.length + split.songs.length === 5
  )

  check('снимок опознан', isImageFile('Объявление.JPG') && isImageFile('фото.png'))
  check('презентация фотографией не считается', !isImageFile('проповедь.pptx'))
  check(
    'то, что окно вывода не покажет, за фотографию не выдаём',
    !isImageFile('IMG_0042.heic') && !isImageFile('снимок.tiff')
  )
  check('папка файла видна', folderOf('C:\\Фото\\Пасха\\01.jpg') === 'C:\\Фото\\Пасха')
  check('имя без расширения', bareName('C:\\Фото\\Объявления.pptx') === 'Объявления')

  const groups = photoGroups([
    'C:\\Фото\\Пасха\\10.jpg',
    'C:\\Фото\\Пасха\\2.jpg',
    'C:\\Фото\\Пасха\\1.jpg',
    'C:\\Фото\\Пасха\\Проповедь.pdf',
    'C:\\Фото\\Крещение\\снимок.png'
  ])
  check('папка — один показ, а не десять пунктов', groups.length === 2, String(groups.length))
  check(
    'показ зовётся по папке',
    groups[0].name === 'Пасха' && groups[0].files.length === 3,
    groups.map((g) => g.name + ': ' + g.files.length).join(', ')
  )
  check(
    'порядок числовой: второй снимок не оказывается после десятого',
    groups[0].files.map((f) => f.split('\\').pop()).join(', ') === '1.jpg, 2.jpg, 10.jpg',
    groups[0].files.join(', ')
  )
  check(
    'презентация в папку снимков не попала',
    !groups[0].files.some((f) => f.endsWith('.pdf'))
  )
  check(
    'одинокий снимок зовётся по имени файла, а не по папке',
    groups[1].name === 'снимок',
    groups[1].name
  )
}

function checkI18n(): void {
  console.log('\n=== Перевод ===')

  const keys = Object.keys(ru)
  const other = Object.keys(en)

  check('языков в списке два', LANGS.length === 2, String(LANGS.length))
  check('ключей в русском словаре', keys.length > 300, String(keys.length))

  const missing = keys.filter((k) => !(k in en))
  const extra = other.filter((k) => !(k in ru))
  check('в английском нет пропусков', missing.length === 0, missing.slice(0, 5).join(', '))
  check('и ничего лишнего', extra.length === 0, extra.slice(0, 5).join(', '))

  const empty = keys.filter(
    (k) => (en as Record<string, string>)[k].trim() === '' && k !== 'part.short.verse'
  )
  check('нет пустых переводов', empty.length === 0, empty.slice(0, 5).join(', '))

  const same = keys.filter(
    (k) =>
      (ru as Record<string, string>)[k] === (en as Record<string, string>)[k] &&
      /[А-Яа-яЁё]/.test((ru as Record<string, string>)[k])
  )
  check('русские строки не остались непереведёнными', same.length === 0, same.slice(0, 5).join(', '))

  const holes = (line: string): string =>
    [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
  const mismatched = keys.filter(
    (k) => holes((ru as Record<string, string>)[k]) !== holes((en as Record<string, string>)[k])
  )
  check('места для чисел и названий совпадают', mismatched.length === 0, mismatched.slice(0, 5).join(', '))

  check(
    'русский: 1 — один, 2 — несколько, 5 — много',
    pluralForm(1, 'ru') === 'one' && pluralForm(2, 'ru') === 'few' && pluralForm(5, 'ru') === 'many'
  )
  check(
    'русский: 11 и 12 — много, а не один и несколько',
    pluralForm(11, 'ru') === 'many' && pluralForm(12, 'ru') === 'many'
  )
  check(
    'русский: 21 — снова один, 22 — снова несколько',
    pluralForm(21, 'ru') === 'one' && pluralForm(22, 'ru') === 'few'
  )
  check(
    'английский: форм две',
    pluralForm(1, 'en') === 'one' && pluralForm(2, 'en') === 'many' && pluralForm(5, 'en') === 'many'
  )

  setLang('ru')
  check('«2 стиха» по-русски', tn('n.verse', 2) === '2 стиха', tn('n.verse', 2))
  check('«5 стихов» по-русски', tn('n.verse', 5) === '5 стихов', tn('n.verse', 5))
  check('подстановка работает', t('home.added', { n: 3 }) === 'Добавлено в план: 3', t('home.added', { n: 3 }))

  setLang('en')
  check('one verse in English', tn('n.verse', 1) === '1 verse', tn('n.verse', 1))
  check('two verses in English', tn('n.verse', 2) === '2 verses', tn('n.verse', 2))
  check('вкладка переводится', t('tab.home') === 'Service', t('tab.home'))
  check('часть песни переводится', t('part.chorus') === 'Chorus', t('part.chorus'))

  setLang('ru')
  check('язык вернулся', t('tab.home') === 'Главная', t('tab.home'))
}

async function checkMenus(): Promise<void> {
  console.log('\n=== Меню ===')

  const read = (rel: string): Promise<string> => readFile(join(process.cwd(), rel), 'utf8')
  const css = await read('src/renderer/src/styles.css')

  const dragging = ['.menubar {', '.tabs {'].filter((selector) => {
    const at = css.indexOf(selector)
    return at >= 0 && css.slice(at, css.indexOf('}', at)).includes('app-region: drag')
  })
  check('за шапку и вкладки окно тащится', dragging.length === 2, dragging.join(', '))

  const rule = css.slice(css.indexOf('body.is-popup'), css.indexOf('body.is-popup') + 200)
  check('пока что-то раскрыто, перетаскивание снимается', css.includes('body.is-popup'))
  check(
    'снимается с обеих полос',
    rule.includes('.menubar') && rule.includes('.tabs') && rule.includes('no-drag'),
    rule.split('\n').slice(0, 4).join(' ')
  )

  for (const [file, what] of [
    ['src/renderer/src/components/MenuBar.tsx', 'верхняя строка меню'],
    ['src/renderer/src/components/ContextMenu.tsx', 'меню по правой кнопке'],
    ['src/renderer/src/components/Select.tsx', 'раскрывающийся список']
  ] as const) {
    check(`${what} снимает перетаскивание`, (await read(file)).includes('useHoldDrag'))
  }

  const nested = css.slice(css.indexOf('.ctxmenu--nested {'))
  check('у вложенного меню нет зазора', !nested.slice(0, nested.indexOf('}')).includes('margin-left'))

  const i18n = await read('src/shared/i18n/index.ts')
  check('в списке языков нет флагов', !/[\u{1F1E6}-\u{1F1FF}]/u.test(i18n))
}

async function checkTrash(): Promise<void> {
  console.log('\n=== Корзина ===')

  interface Thing {
    id: string
    title: string
    deletedAt?: number
    updatedAt?: number
  }

  const fake = (
    items: Thing[],
    trash: Thing[]
  ): JsonFile<{ items: Thing[]; trash: Thing[] }> => {
    let value = { items, trash }
    return {
      read: async () => value,
      write: async (next) => {
        value = next
      },
      flush: async () => undefined
    }
  }

  const было: Thing[] = [{ id: 'старое', title: 'старое' }]
  const стало = toTrash(было, { id: 'новое', title: 'новое' }, 3)
  check('удалённое ложится сверху', стало[0]?.id === 'новое', стало.map((x) => x.id).join(', '))
  check('время удаления отмечается', typeof стало[0]?.deletedAt === 'number')
  check('прежнее остаётся', стало[1]?.id === 'старое')

  const полная = [{ id: 'а' }, { id: 'б' }, { id: 'в' }]
  const тесно = toTrash(полная, { id: 'г' }, 3)
  check('за пределом вытесняется самое старое', tesnoOk(тесно), тесно.map((x) => x.id).join(', '))

  const store = fake([{ id: 'живая', title: 'живая' }], [
    { id: 'снесённая', title: 'снесённая', deletedAt: 111 }
  ])
  const bin = binOf(store)

  check('в корзине видно удалённое', (await bin.list()).length === 1)
  check('возврат отвечает «нашлось»', await bin.restore('снесённая'))

  const после = await store.read()
  check('вернулось в библиотеку', после.items.some((x) => x.id === 'снесённая'))
  check('и ушло из корзины', после.trash.length === 0)
  check(
    'отметка об удалении снята',
    после.items.find((x) => x.id === 'снесённая')?.deletedAt === undefined,
    'иначе вернувшееся считалось бы удалённым'
  )
  check('живое не задвоилось', после.items.filter((x) => x.id === 'живая').length === 1)
  check('вернуть то, чего нет, нельзя', !(await bin.restore('его-нет')))

  const второй = fake([], [{ id: 'один' }, { id: 'два' }])
  const bin2 = binOf(второй)
  check('стирание отвечает «нашлось»', await bin2.purge('один'))

  const остаток = await второй.read()
  check('стёрлось только своё', остаток.trash.length === 1 && остаток.trash[0].id === 'два')
  check('стёртое не всплывает в библиотеке', остаток.items.length === 0)
  check('стереть то, чего нет, нельзя', !(await bin2.purge('его-нет')))

  const третий = fake([], [{ id: 'а' }, { id: 'б' }, { id: 'в' }])
  const bin3 = binOf(третий)
  check('очистка отвечает, сколько выкинуто', (await bin3.clear()) === 3)
  check('корзина опустела', (await третий.read()).trash.length === 0)
  check('пустую очищать нечем', (await bin3.clear()) === 0)
}

function tesnoOk(list: { id: string }[]): boolean {
  return list.length === 3 && list[0].id === 'г' && !list.some((x) => x.id === 'в')
}

async function checkOutputWindows(): Promise<void> {
  console.log('\n=== Окна вывода ===')

  const read = (rel: string): Promise<string> => readFile(join(process.cwd(), rel), 'utf8')
  const outputs = await read('src/main/outputs.ts')
  const css = await read('src/renderer/src/styles.css')
  const page = await read('src/renderer/src/output.tsx')

  check('у окон вывода свой значок, а не стандартный', outputs.includes('appIcon()'))
  check(
    'окно рядом с пультом уходит за него',
    outputs.includes('controlWindow()?.moveTop()'),
    'на своём мониторе вывод — копия предпросмотра, лезть поверх работы ему незачем'
  )
  check('заголовок не отдан странице', outputs.includes('page-title-updated'))
  check(
    'в заголовке видно, какое это окно',
    outputs.includes("t('main.outputTitle'") && 'main.outputTitle' in ru,
    'зал, сцена и трансляция бывают открыты разом'
  )

  const hall = css.slice(css.indexOf('body.body--output {'))
  check('в зале курсора нет', hall.slice(0, hall.indexOf('}')).includes('cursor: none'))

  const windowed = css.slice(css.indexOf('body.body--output.is-windowed'))
  check(
    'в окне рядом с пультом курсор возвращается',
    windowed.slice(0, windowed.indexOf('}')).includes('cursor: default')
  )
  check('окно вывода само знает, какое оно', page.includes("params.get('windowed')"))
}

function checkThemeBackground(): void {
  console.log('\n=== Фон из темы презентации ===')

  const master =
    '<p:sldMaster><p:cSld><p:bg><p:bgRef idx="1003">' +
    '<a:schemeClr val="bg2"/></p:bgRef></p:bg></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/></p:sldMaster>'

  const theme =
    '<a:theme><a:themeElements><a:clrScheme name="Легкий дым">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="766F54"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="E3EACF"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="A53010"/></a:accent1>' +
    '</a:clrScheme><a:fmtScheme><a:bgFillStyleLst>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="90000"/><a:lumMod val="120000"/></a:schemeClr></a:gs>' +
    '<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="98000"/><a:lumMod val="98000"/></a:schemeClr></a:gs>' +
    '</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>' +
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="90000"/><a:satMod val="92000"/><a:lumMod val="120000"/></a:schemeClr></a:gs>' +
    '<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="98000"/><a:satMod val="120000"/><a:lumMod val="98000"/></a:schemeClr></a:gs>' +
    '</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="100000" b="100000"/></a:path></a:gradFill>' +
    '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'

  const wisp = backgroundFromXml({ slide: '<p:sld/>', layout: '<p:sldLayout/>', master, theme })

  check('фон нашёлся, хотя картинок в файле нет', wisp !== null)
  check('это переливка, а не сплошной цвет', wisp?.kind === 'gradient', wisp?.kind)

  const css = wisp?.kind === 'gradient' ? wisp.css : ''

  check('взята третья заливка темы — круговая', css.startsWith('radial-gradient'), css)

  check('светлое пятно посередине', css.includes('at 50% 50%'), css)

  check('середина белая, как у PowerPoint', css.includes('#ffffff 0%'), css)
  check('край кремовый', /#d[cd]e[45]c[0-9a-f] 100%/.test(css), css)

  const solid = backgroundFromXml({
    master:
      '<p:sldMaster><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg2"/></p:bgRef></p:bg>' +
      '<p:clrMap bg2="lt2"/></p:sldMaster>',
    theme
  })
  check(
    'первая заливка темы — ровный цвет палитры',
    solid?.kind === 'color' && solid.color === '#e3eacf',
    JSON.stringify(solid)
  )

  const own = backgroundFromXml({
    slide: '<p:sld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="1A2B3C"/></a:solidFill></p:bgPr></p:bg></p:sld>',
    master,
    theme
  })
  check(
    'свой фон слайда главнее темы',
    own?.kind === 'color' && own.color === '#1a2b3c',
    JSON.stringify(own)
  )

  const straight = backgroundFromXml({
    master:
      '<p:sldMaster><p:bg><p:bgRef idx="1002"><a:schemeClr val="bg2"/></p:bgRef></p:bg>' +
      '<p:clrMap bg2="lt2"/></p:sldMaster>',
    theme
  })

  check(
    'прямая переливка сверху вниз',
    straight?.kind === 'gradient' && straight.css.startsWith('linear-gradient(180deg'),
    straight?.kind === 'gradient' ? straight.css : String(straight)
  )

  const белый = { color: '#ffffff' }
  check(
    'на кремовой бумаге текст темнеет',
    readableStyleOn(белый, wisp).color === '#111111',
    readableStyleOn(белый, wisp).color
  )
  check(
    'на тёмной заливке белый остаётся белым',
    readableStyleOn(белый, { kind: 'color', color: '#0a1020' }).color === '#ffffff'
  )
  check('без фона оформление не трогаем', readableStyleOn(белый, null) === белый)
  check(
    'яркость картинки отсюда не видно — цвет не трогаем',
    readableStyleOn(белый, { kind: 'image', src: 'visio://bg/x.png' }) === белый
  )

  check('без фона — ничего', backgroundFromXml({ slide: '<p:sld/>' }) === null)
  check('пустой разбор не падает', backgroundFromXml({}) === null)
  check(
    'фон картинкой отдаём другому разбору',
    backgroundFromXml({
      slide: '<p:sld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId2"/></a:blipFill></p:bgPr></p:bg></p:sld>'
    }) === null
  )
}

function checkScreenPicker(): void {
  console.log('\n=== Выбор экрана для предпросмотра ===')

  const screen = (
    id: number,
    width: number,
    height: number,
    scale = 1,
    extra: Partial<DisplayInfo> = {}
  ): DisplayInfo => ({
    id,
    label: '',
    bounds: { x: 0, y: 0, width, height },
    resolution: { width: Math.round(width * scale), height: Math.round(height * scale) },
    scaleFactor: scale,
    isPrimary: false,
    isControl: false,
    assignedRole: null,
    ...extra
  })

  check('подпись — это разрешение', screenLabel(screen(1, 1920, 1080)) === '1920 × 1080')

  check(
    'масштаб Windows учтён',
    screenLabel(screen(1, 2560, 1440, 1.5)) === '3840 × 2160',
    screenLabel(screen(1, 2560, 1440, 1.5))
  )

  check('широкий экран', Math.abs((screenAspect(screen(1, 1920, 1080)) ?? 0) - 16 / 9) < 1e-9)
  check('экран 16:10', Math.abs((screenAspect(screen(1, 1920, 1200)) ?? 0) - 1.6) < 1e-9)
  check('вертикальный экран', (screenAspect(screen(1, 1080, 1920)) ?? 0) < 1)
  check('нулевого кадра не бывает', screenAspect(screen(1, 0, 0)) === null)

  const pult = screen(1, 1920, 1080, 1, { isControl: true, isPrimary: true })
  const projector = screen(2, 1024, 768)
  const tv = screen(3, 3840, 2160)

  check('экранов нет — выбирать нечего', previewScreen([], null, null) === null)
  check(
    'при первом запуске смотрим на зал',
    previewScreen([pult, projector, tv], null, 2) === 2
  )
  check(
    'зала нет — берём основной',
    previewScreen([pult, projector, tv], null, null) === 1
  )
  check('и основного нет — первый', previewScreen([projector, tv], null, null) === 2)
  check('выбранный не трогаем', previewScreen([pult, projector, tv], 3, 2) === 3)

  check('пропавший экран сменяется', previewScreen([pult, tv], 2, null) === 1)

  const twins = [screen(7, 1920, 1080), screen(8, 1920, 1080)]
  check('одинаковые мониторы не сливаются', previewScreen(twins, 8, null) === 8)
  check('подписи у них совпадают', screenLabel(twins[0]) === screenLabel(twins[1]))
}

function checkScreens(): void {
  console.log('\n=== Экраны ===')

  const one = [{ id: 1 }]
  const two = [{ id: 1 }, { id: 2 }]
  const three = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const PULT = 1

  check('ролей три', ROLES.length === 3, ROLES.join(', '))
  check('роль узнаётся', isRole('hall') && isRole('stream'))
  check('чужое не проходит за роль', !isRole('projector') && !isRole(null))

  check('на экране пульта — только окном', showsWindowed(PULT, PULT))
  check('на проекторе — во весь экран', !showsWindowed(2, PULT))
  check(
    'промах мышью не накрывает пульт',
    showsWindowed(PULT, PULT),
    'выбрали свой экран при живом проекторе'
  )
  check('пульт неизвестен — разворачиваем', !showsWindowed(1, null))

  check('по умолчанию — чужой экран', defaultScreen(two, PULT)?.id === 2)
  check('монитор один — он же и берётся', defaultScreen(one, PULT)?.id === 1)
  check('экранов нет — некуда', defaultScreen([], PULT) === null)

  check('проектор выдернули — уходим к пульту', fallbackScreen(one, PULT)?.id === 1)
  check('уходим на другой чужой, если он есть', fallbackScreen(three, PULT)?.id === 2)

  const windowedHall = [{ role: 'hall' as const, displayId: PULT, windowed: true }]
  check(
    'подключили проектор — зал уезжает на него',
    movable(windowedHall, two, PULT)[0]?.displayId === 2,
    JSON.stringify(movable(windowedHall, two, PULT))
  )
  check('без второго экрана переезжать некуда', movable(windowedHall, one, PULT).length === 0)
  check(
    'вывод на проекторе не трогаем',
    movable([{ role: 'hall', displayId: 2, windowed: false }], two, PULT).length === 0
  )
  check(
    'поставленное оператором на свой экран не трогаем',
    movable([{ role: 'hall', displayId: PULT, windowed: false }], two, PULT).length === 0,
    'окном его сделал не размер стола, а выбор'
  )

  const bothWindowed = [
    { role: 'stage' as const, displayId: PULT, windowed: true },
    { role: 'hall' as const, displayId: PULT, windowed: true }
  ]
  const moved = movable(bothWindowed, two, PULT)
  check('на один свободный экран едет зал, а не сцена', moved.length === 1 && moved[0].role === 'hall')
  check('на два свободных — оба', movable(bothWindowed, three, PULT).length === 2)
  check(
    'занятый экран за свободный не считаем',
    movable(
      [
        { role: 'hall', displayId: 2, windowed: false },
        { role: 'stage', displayId: PULT, windowed: true }
      ],
      two,
      PULT
    ).length === 0
  )

  const saved = [{ role: 'hall', displayId: 2 }]
  check('вывод возвращается на свой экран', restorePlan(saved, two, PULT)[0]?.displayId === 2)
  check('дома, с одним монитором, ничего не открывается', restorePlan(saved, one, PULT).length === 0)
  check(
    'номер экрана сменился — берём единственный чужой',
    restorePlan([{ role: 'hall', displayId: 77 }], two, PULT)[0]?.displayId === 2,
    'Windows любит перенумеровать мониторы'
  )
  check(
    'чужих несколько, а номер незнаком — не гадаем',
    restorePlan([{ role: 'hall', displayId: 77 }], three, PULT).length === 0
  )
  check('мусор в настройках не открывает окон', restorePlan('здрасьте', two, PULT).length === 0)
  check(
    'неизвестная роль пропускается',
    restorePlan([{ role: 'balcony', displayId: 2 }], two, PULT).length === 0
  )
  check(
    'роль не открывается дважды',
    restorePlan(
      [
        { role: 'hall', displayId: 2 },
        { role: 'hall', displayId: 2 }
      ],
      two,
      PULT
    ).length === 1
  )
}

async function checkThemes(): Promise<void> {
  console.log('\n=== Стили ===')

  const css = await readFile(
    join(process.cwd(), 'src/renderer/src/themes.css'),
    'utf8'
  )

  const blocks = new Map<string, Map<string, string>>()
  for (const match of css.matchAll(/\[data-theme='([a-z]+)'\][^{]*\{([^}]*)\}/g)) {
    const vars = new Map<string, string>()
    for (const line of match[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      vars.set(line[1], line[2].trim())
    }
    blocks.set(match[1], vars)
  }

  check('стилей в списке тринадцать', THEMES.length === 13, String(THEMES.length))
  check('и столько же в themes.css', blocks.size === THEMES.length, String(blocks.size))

  const noBlock = THEMES.filter((theme) => !blocks.has(theme.id)).map((t) => t.id)
  check('у каждого стиля есть краски', noBlock.length === 0, noBlock.join(', '))

  const orphan = [...blocks.keys()].filter((id) => !isTheme(id))
  check('лишних блоков в themes.css нет', orphan.length === 0, orphan.join(', '))

  check('стиль по умолчанию из списка', isTheme(DEFAULT_THEME), DEFAULT_THEME)
  check('«ночь» — источник значений', blocks.get('night') !== undefined)

  const wanted = [...(blocks.get('night')?.keys() ?? [])]
  check('переменных в стиле два десятка с лишним', wanted.length >= 24, String(wanted.length))

  const short = THEMES.filter((theme) => {
    const vars = blocks.get(theme.id)
    return !vars || wanted.some((name) => !vars.has(name))
  }).map((theme) => theme.id)
  check('ни один стиль не потерял переменную', short.length === 0, short.join(', '))

  const sameAsAccent = THEMES.filter((theme) => {
    const vars = blocks.get(theme.id)
    return vars?.get('--live') === vars?.get('--accent')
  }).map((theme) => theme.id)
  check('эфир не совпадает с акцентом', sameAsAccent.length === 0, sameAsAccent.join(', '))

  const noLive = THEMES.filter((theme) => !blocks.get(theme.id)?.get('--live-soft'))
  check('подложка эфира задана везде', noLive.length === 0, noLive.map((t) => t.id).join(', '))

  const notHex = THEMES.filter((theme) => {
    const vars = blocks.get(theme.id)
    return !isChrome({
      back: vars?.get('--surface-0'),
      bar: vars?.get('--surface-1'),
      symbol: vars?.get('--text-2')
    })
  }).map((theme) => theme.id)
  check('цвета рамки окна шестнадцатеричные', notHex.length === 0, notHex.join(', '))

  check('запасные цвета рамки годятся', isChrome(NIGHT_CHROME))
  check('подделка не проходит', !isChrome({ back: 'red', bar: '#000000', symbol: '#fff' }))
  check('обрывок настроек не проходит', !isChrome({ back: '#08090b' }))

  const named = THEMES.filter(
    (theme) => `theme.${theme.id}` in ru && `theme.${theme.id}` in en
  )
  check('у каждого стиля есть имя на двух языках', named.length === THEMES.length)

  const families = FAMILIES.filter((f) => `style.${f}` in ru && `style.${f}` in en)
  check('и у каждой кучки тоже', families.length === FAMILIES.length)

  const homeless = THEMES.filter((theme) => !FAMILIES.includes(theme.family))
  check('каждый стиль лежит в своей кучке', homeless.length === 0)

  const emptyFamily = FAMILIES.filter((f) => !THEMES.some((theme) => theme.family === f))
  check('пустых кучек нет', emptyFamily.length === 0, emptyFamily.join(', '))

  console.log('\n=== Сайт программы ===')

  check('адрес сайта на месте', SITE.startsWith('https://') && SITE.includes('visiologos'))
  check('в подписи нет «https://»', !SITE_NAME.includes('/'))
  check('доменов два', siteHosts().length === 2, siteHosts().join(', '))

  check('свой домен открывается', isOurSite('https://visiologos.ru/modules'))
  check('и зеркало тоже', isOurSite('https://visiologos.online/'))
  check('и www перед ним', isOurSite('https://www.visiologos.ru/'))
  check('чужой домен не открывается', !isOurSite('https://visiologos.ru.evil.example/'))
  check('похожий домен не открывается', !isOurSite('https://notvisiologos.ru/'))
  check('file:// не открывается', !isOurSite('file:///C:/Windows/System32'))
  check('javascript: не открывается', !isOurSite('javascript:alert(1)'))
  check('мусор вместо адреса не открывается', !isOurSite('не адрес вовсе'))

  check(
    'имя модуля кодируется для адреса',
    modulePath('Новый Завет') === '/download/module/%D0%9D%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%97%D0%B0%D0%B2%D0%B5%D1%82.zip'
  )
  check('и косая черта в имени не уходит наружу', !modulePath('a/b').includes('a/b'))

  check('язык называется по-своему', langName('uk') === 'Українська')
  check('и русский тоже', langName('ru') === 'Русский')
  check('незнакомый язык виден кодом', langName('zz') === 'ZZ')

  const styles = await readFile(
    join(process.cwd(), 'src/renderer/src/styles.css'),
    'utf8'
  )
  check('цвета не разбрелись обратно в styles.css', !styles.includes('--surface-0:'))

  const site = await readFile(join(process.cwd(), 'src/main/siteFetch.ts'), 'utf8')
  check('в сеть главный процесс ходит через net.fetch', site.includes('net.fetch('))

  const mainFiles = [
    'src/main/siteFetch.ts',
    'src/main/update.ts',
    'src/main/bible/fromSite.ts',
    'src/main/ipc.ts'
  ]
  const strays: string[] = []
  for (const name of mainFiles) {
    const body = (await readFile(join(process.cwd(), name), 'utf8')).replace(
      /net\.fetch\(/g,
      'net_fetch('
    )
    for (const line of body.split('\n')) {

      if (/(^|[^.\w])fetch\(/.test(line) && !line.trim().startsWith('*')) {
        strays.push(name + ': ' + line.trim())
      }
    }
  }
  check('обычного fetch в главном процессе не осталось', strays.length === 0, strays[0] ?? '')

  check('версия новее опознана', isNewer('0.2.2', '0.2.1'))
  check('та же версия — не новее', !isNewer('0.2.1', '0.2.1'))
  check('старая версия — не новее', !isNewer('0.2.0', '0.2.1'))

  check('десятая доля больше девятой', isNewer('0.10.0', '0.9.0'))
  check('и в третьем числе тоже', isNewer('1.2.10', '1.2.9'))
  check('короткая запись не путает', isNewer('1.3', '1.2.9') && !isNewer('1.2', '1.2.0'))
  check('мусор вместо версии ничего не ломает', !isNewer('', '0.2.1') && !isNewer('ой', '0.2.1'))

  check(
    'свой установщик опознан',
    looksLikeInstaller('VisioLogos-0.2.2-setup.exe') &&
      looksLikeInstaller('VisioLogos-1.0.0-portable.exe')
  )

  check(
    'чужое имя установщиком не считается',
    !looksLikeInstaller('virus.exe') &&
      !looksLikeInstaller('VisioLogos-0.2.2-setup.exe.bat') &&
      !looksLikeInstaller('..\\VisioLogos-0.2.2-setup.exe')
  )
  check('размер пишется словами', weighUpdate(122886831) === '117 МБ')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
