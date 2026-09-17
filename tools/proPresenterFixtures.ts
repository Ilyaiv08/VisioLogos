export function rtfCp1251(text: string): Buffer {
  const head = Buffer.from(
    '{\\rtf1\\ansi\\ansicpg1251\\deff0{\\fonttbl{\\f0\\fnil\\fcharset204 Arial;}}\\f0\\fs80 ',
    'latin1'
  )
  const body: number[] = []

  for (const line of text.split('\n')) {
    if (body.length > 0) body.push(...Buffer.from('\\par ', 'latin1'))
    for (const ch of line) {
      const byte = cp1251(ch)
      if (byte === null) body.push(...Buffer.from(ch, 'latin1'))
      else body.push(...Buffer.from(`\\'${byte.toString(16)}`, 'latin1'))
    }
  }
  return Buffer.concat([head, Buffer.from(body), Buffer.from('}', 'latin1')])
}

export function rtfUnicode(text: string): Buffer {
  const body = text
    .split('\n')
    .map((line) =>
      [...line]
        .map((ch) => (ch.charCodeAt(0) < 128 ? ch : `\\u${ch.charCodeAt(0)} ?`))
        .join('')
    )
    .join('\\par ')

  return Buffer.from(`{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\\fs80 ${body}}`, 'latin1')
}

const TO_CP1251 = new Map<string, number>()
for (let byte = 128; byte < 256; byte++) {
  TO_CP1251.set(new TextDecoder('windows-1251').decode(Uint8Array.of(byte)), byte)
}

const cp1251 = (ch: string): number | null =>
  ch.charCodeAt(0) < 128 ? null : (TO_CP1251.get(ch) ?? null)

export interface FixtureGroup {
  name: string
  slides: string[]
}

export function pro6(title: string, groups: FixtureGroup[], mac = false): Buffer {
  const rtf = mac ? rtfUnicode : rtfCp1251

  const body = groups
    .map(
      (group) => `  <RVSlideGrouping name="${group.name}" uuid="g-${group.name}">
   <slides containerClass="NSMutableArray">
${group.slides
  .map(
    (slide) => `    <RVDisplaySlide enabled="true" label="" notes="">
     <displayElements containerClass="NSMutableArray">
      <RVTextElement displayName="TextElement" RTFData="${rtf(slide).toString('base64')}"/>
     </displayElements>
    </RVDisplaySlide>`
  )
  .join('\n')}
   </slides>
  </RVSlideGrouping>`
    )
    .join('\n')

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument versionNumber="600" CCLISongTitle="${title}" CCLIAuthor="Карл Боберг" CCLISongNumber="142">
 <groups containerClass="NSMutableArray">
${body}
 </groups>
</RVPresentationDocument>`,
    'utf8'
  )
}

const varint = (value: number): number[] => {
  const out: number[] = []
  let rest = value
  while (rest > 127) {
    out.push((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  out.push(rest)
  return out
}

const field = (number: number, payload: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(varint((number << 3) | 2)),
    Buffer.from(varint(payload.length)),
    payload
  ])

export function pro7(title: string, groups: FixtureGroup[]): Buffer {
  const parts = [field(1, Buffer.from(title, 'utf8'))]

  for (const group of groups) {
    parts.push(
      field(
        4,
        Buffer.concat([
          field(1, Buffer.from(group.name, 'utf8')),
          ...group.slides.map((slide) => field(2, field(3, rtfCp1251(slide))))
        ])
      )
    )
  }
  return Buffer.concat(parts)
}
