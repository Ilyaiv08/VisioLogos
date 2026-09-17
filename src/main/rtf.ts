const CHARSETS: Record<number, string> = {
  0: 'windows-1252',
  77: 'macintosh',
  128: 'shift_jis',
  129: 'euc-kr',
  134: 'gbk',
  136: 'big5',
  161: 'windows-1253',
  162: 'windows-1254',
  177: 'windows-1255',
  178: 'windows-1256',
  186: 'windows-1257',
  204: 'windows-1251',
  222: 'windows-874',
  238: 'windows-1250'
}

const SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'generator',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'xmlnstbl',
  'filetbl'
])

const LITERALS: Record<string, string> = {
  par: '\n',
  line: '\n',
  sect: '\n',
  page: '\n',
  softline: '\n',
  cell: '\t',
  row: '\n',
  tab: '\t',
  emdash: '—',
  endash: '–',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '«',
  rdblquote: '»',
  emspace: ' ',
  enspace: ' ',
  qmspace: ' '
}

interface State {

  codepage: string

  uc: number

  skip: boolean
}

export function rtfToText(rtf: string): string {
  const fonts = readFontTable(rtf)
  const defaultCodepage = codepageFromAnsicpg(rtf) ?? fonts.get(defaultFont(rtf)) ?? 'windows-1252'

  const out: string[] = []
  let bytes: number[] = []
  let bytesCodepage = defaultCodepage

  const flush = (): void => {
    if (bytes.length === 0) return
    out.push(new TextDecoder(bytesCodepage).decode(new Uint8Array(bytes)))
    bytes = []
  }
  const pushByte = (byte: number, codepage: string): void => {
    if (codepage !== bytesCodepage) {
      flush()
      bytesCodepage = codepage
    }
    bytes.push(byte)
  }
  const pushText = (text: string): void => {
    flush()
    out.push(text)
  }

  let state: State = { codepage: defaultCodepage, uc: 1, skip: false }
  const stack: State[] = []

  let skipAfterUnicode = 0
  let i = 0

  while (i < rtf.length) {
    const ch = rtf[i]

    if (ch === '{') {
      stack.push(state)
      state = { ...state }
      i++
      continue
    }

    if (ch === '}') {
      state = stack.pop() ?? state
      skipAfterUnicode = 0
      i++
      continue
    }

    if (ch === '\\') {
      const next = rtf[i + 1]

      if (next === "'") {
        const byte = parseInt(rtf.slice(i + 2, i + 4), 16)
        i += 4
        if (skipAfterUnicode > 0) {
          skipAfterUnicode--
          continue
        }
        if (!state.skip && Number.isFinite(byte)) pushByte(byte, state.codepage)
        continue
      }

      const word = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rtf.slice(i, i + 40))
      if (word) {
        i += word[0].length
        const name = word[1]
        const param = word[2] === undefined ? null : Number(word[2])

        if (name === 'u') {

          const code = param === null ? 0 : param < 0 ? param + 65536 : param
          if (!state.skip && skipAfterUnicode === 0) pushText(String.fromCodePoint(code))
          skipAfterUnicode = state.uc
          continue
        }

        if (skipAfterUnicode > 0) {
          skipAfterUnicode--
          continue
        }

        if (name === 'uc') state.uc = param ?? 1
        else if (name === 'f') {
          const codepage = fonts.get(param ?? -1)
          if (codepage) state.codepage = codepage
        } else if (name === 'ansicpg') {
          const codepage = windowsCodepage(param ?? 0)
          if (codepage) state.codepage = codepage
        } else if (SKIP_DESTINATIONS.has(name)) state.skip = true
        else if (LITERALS[name] !== undefined && !state.skip) pushText(LITERALS[name])
        continue
      }

      i += 2
      if (skipAfterUnicode > 0) {
        skipAfterUnicode--
        continue
      }
      if (next === '*') state.skip = true
      else if (state.skip) continue
      else if (next === '\\' || next === '{' || next === '}') pushText(next)
      else if (next === '~') pushText('\xa0')
      else if (next === '_') pushText('-')
      else if (next === '\n' || next === '\r') pushText('\n')
      continue
    }

    i++

    if (ch === '\r' || ch === '\n') continue
    if (skipAfterUnicode > 0) {
      skipAfterUnicode--
      continue
    }
    if (!state.skip) pushByte(ch.charCodeAt(0) & 0xff, state.codepage)
  }

  flush()
  return out
    .join('')
    .replace(/\x00/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readFontTable(rtf: string): Map<number, string> {
  const fonts = new Map<number, string>()
  const start = rtf.indexOf('{\\fonttbl')
  if (start < 0) return fonts

  const table = rtf.slice(start, start + balancedLength(rtf, start))
  for (const m of table.matchAll(/\\f(\d+)\b([^;]*)/g)) {
    const charset = /\\fcharset(\d+)/.exec(m[2])
    const codepage = charset ? CHARSETS[Number(charset[1])] : undefined
    if (codepage) fonts.set(Number(m[1]), codepage)
  }
  return fonts
}

const defaultFont = (rtf: string): number => Number(/\\deff(\d+)/.exec(rtf)?.[1] ?? -1)

const codepageFromAnsicpg = (rtf: string): string | null => {
  const m = /\\ansicpg(\d+)/.exec(rtf)
  return m ? windowsCodepage(Number(m[1])) : null
}

function windowsCodepage(number: number): string | null {
  if (number >= 1250 && number <= 1258) return `windows-${number}`
  if (number === 874) return 'windows-874'
  if (number === 10000) return 'macintosh'
  return null
}

function balancedLength(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i - start + 1
    }
  }
  return text.length - start
}

export function findRtfChunks(data: string): { at: number; rtf: string }[] {
  const chunks: { at: number; rtf: string }[] = []
  let at = data.indexOf('{\\rtf')

  while (at >= 0) {
    const length = balancedLength(data, at)
    chunks.push({ at, rtf: data.slice(at, at + length) })
    at = data.indexOf('{\\rtf', at + length)
  }
  return chunks
}
