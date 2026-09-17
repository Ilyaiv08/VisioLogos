import { strToU8, zipSync } from 'fflate'
import type { SlideStyle, Song } from '@shared/types'
import { partTitle } from '@shared/songs'
import { t } from '@shared/i18n'
import { shadowHex } from '@shared/backgrounds'

export interface DeckLook {
  style: SlideStyle

  background: { data: Buffer; format: 'png' | 'jpeg' } | null

  sizes: number[]
}

export const reservePct = (style: SlideStyle): number =>
  style.fontSizeVh * style.referenceScale * 1.5

const WIDTH = 12192000
const HEIGHT = 6858000

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

export interface SlideText {

  lines: string[]

  note: string
  title: boolean
}

export function songSlides(songs: Song[]): SlideText[] {
  const slides = songs.flatMap(slidesOfSong)
  return slides.length > 0 ? slides : [{ lines: [t('main.emptySlide')], note: '', title: true }]
}

export function pptxOfSongs(slides: SlideText[], look: DeckLook): Uint8Array {
  const image = look.background
  const ext = image?.format === 'jpeg' ? 'jpg' : 'png'

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(slides.length, image?.format ?? null)),
    '_rels/.rels': strToU8(rootRels()),
    'ppt/presentation.xml': strToU8(presentation(slides.length)),
    'ppt/_rels/presentation.xml.rels': strToU8(presentationRels(slides.length)),

    'ppt/slideMasters/slideMaster1.xml': strToU8(slideMaster(Boolean(image))),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(masterRels(image ? ext : null)),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(slideLayout()),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(layoutRels()),
    'ppt/theme/theme1.xml': strToU8(theme())
  }
  if (image) files[`ppt/media/image1.${ext}`] = new Uint8Array(image.data)

  slides.forEach((slide, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] =
      strToU8(slideXml(slide, look.style, look.sizes[i] ?? look.style.fontSizeVh))
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(slideRels())
  })

  return zipSync(files, { level: 6 })
}

function slidesOfSong(song: Song): SlideText[] {
  const about = [song.author, song.number && `№ ${song.number}`].filter(Boolean).join(' · ')
  const slides: SlideText[] = [
    { lines: [song.title || t('common.untitled')], note: about, title: true }
  ]

  for (const id of song.order) {
    const part = song.parts.find((p) => p.id === id)
    if (!part || !part.text.trim()) continue
    slides.push({ lines: part.text.split('\n'), note: partTitle(part), title: false })
  }

  if (slides.length === 1) {
    for (const part of song.parts) {
      if (part.text.trim()) {
        slides.push({ lines: part.text.split('\n'), note: partTitle(part), title: false })
      }
    }
  }
  return slides
}

function slideXml(slide: SlideText, style: SlideStyle, fontVh: number): string {

  const pt = (vh: number): number => Math.round((vh / 100) * 540 * 100)
  const pad = Math.round((style.paddingPct / 100) * WIDTH)
  const reserve = Math.round((reservePct(style) / 100) * HEIGHT)

  const main =
    slide.lines
      .map(
        (line) =>
          `<a:p>${paragraph(style)}<a:r>${runProps(pt(fontVh), style)}` +
          `<a:t>${xml(style.uppercase ? line.toUpperCase() : line)}</a:t></a:r></a:p>`
      )
      .join('') +

    (slide.title && slide.note
      ? `<a:p>${paragraph(style)}<a:r>${runProps(pt(fontVh * 0.42), style, 80)}` +
        `<a:t>${xml(slide.note)}</a:t></a:r></a:p>`
      : '')

  const note =
    slide.note && !slide.title
      ? textBox(
          3,
          'Подпись',
          { x: pad, y: HEIGHT - pad - reserve, cx: WIDTH - pad * 2, cy: reserve },
          'b',
          `<a:p><a:pPr algn="r"/><a:r>` +
            `${runProps(pt(style.fontSizeVh * style.referenceScale), style, 88)}` +
            `<a:t>${xml(slide.note)}</a:t></a:r></a:p>`
        )
      : ''

  return `${HEAD}
<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
 <p:cSld>
  <p:spTree>
   ${EMPTY_GROUP}
   ${textBox(
     2,
     'Текст',
     { x: pad, y: pad, cx: WIDTH - pad * 2, cy: HEIGHT - pad * 2 - reserve },
     'ctr',
     main
   )}
   ${note}
  </p:spTree>
 </p:cSld>
 <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
}

interface Box {
  x: number
  y: number
  cx: number
  cy: number
}

function textBox(id: number, name: string, box: Box, anchor: string, body: string): string {
  return `<p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr>
     <a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>
     <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
     <a:noFill/>
    </p:spPr>
    <p:txBody>
     <a:bodyPr wrap="square" anchor="${anchor}" lIns="0" tIns="0" rIns="0" bIns="0"/>
     <a:lstStyle/>
     ${body}
    </p:txBody>
   </p:sp>`
}

const ALIGN = { left: 'l', center: 'ctr', right: 'r' } as const

const paragraph = (style: SlideStyle): string =>
  `<a:pPr algn="${ALIGN[style.align]}">` +
  `<a:lnSpc><a:spcPct val="${Math.round(style.lineHeight * 100000)}"/></a:lnSpc></a:pPr>`

function runProps(size: number, style: SlideStyle, alpha = 100): string {
  const color = style.color.replace('#', '').slice(0, 6).toUpperCase() || 'FFFFFF'
  const fill =
    alpha >= 100
      ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`
      : `<a:solidFill><a:srgbClr val="${color}"><a:alpha val="${alpha * 1000}"/></a:srgbClr></a:solidFill>`

  const shadow = style.shadow
    ? '<a:effectLst><a:outerShdw blurRad="50800" dist="25400" dir="5400000" algn="t" rotWithShape="0">' +
      `<a:srgbClr val="${shadowHex(style.color)}"><a:alpha val="60000"/></a:srgbClr>` +
      '</a:outerShdw></a:effectLst>'
    : ''

  const font = officeFont(style.fontFamily)
  return (
    `<a:rPr lang="ru-RU" sz="${size}" b="${style.bold ? 1 : 0}" dirty="0">${fill}${shadow}` +
    `<a:latin typeface="${xml(font)}"/><a:cs typeface="${xml(font)}"/></a:rPr>`
  )
}

export function officeFont(family: string): string {
  const names = family
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name && !/variable/i.test(name) && name !== 'PT Serif')

  const generic = new Set(['serif', 'sans-serif', 'monospace', 'system-ui'])
  return names.find((name) => !generic.has(name.toLowerCase())) ?? 'Georgia'
}

const EMPTY_GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

function contentTypes(count: number, image: 'png' | 'jpeg' | null): string {
  const slides = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('')

  return `${HEAD}
<Types xmlns="${NS_CT}">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 ${image === 'png' ? '<Default Extension="png" ContentType="image/png"/>' : ''}
 ${image === 'jpeg' ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ''}
 <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
 <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
 <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
 <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
 ${slides}
</Types>`
}

const rootRels = (): string => `${HEAD}
<Relationships xmlns="${NS_REL}">
 <Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

function presentation(count: number): string {
  const ids = Array.from(
    { length: count },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
  ).join('')

  return `${HEAD}
<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">
 <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
 <p:sldIdLst>${ids}</p:sldIdLst>
 <p:sldSz cx="${WIDTH}" cy="${HEIGHT}"/>
 <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
}

function presentationRels(count: number): string {
  const slides = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="${DOC_REL}/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('')

  return `${HEAD}
<Relationships xmlns="${NS_REL}">
 <Relationship Id="rId1" Type="${DOC_REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>
 ${slides}
 <Relationship Id="rId${count + 2}" Type="${DOC_REL}/theme" Target="theme/theme1.xml"/>
</Relationships>`
}

const slideMaster = (image: boolean): string => `${HEAD}
<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">
 <p:cSld>
  <p:bg><p:bgPr>${
    image
      ? '<a:blipFill rotWithShape="1"><a:blip r:embed="rId3"/>' +
        '<a:stretch><a:fillRect/></a:stretch></a:blipFill>'
      : '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>'
  }<a:effectLst/></p:bgPr></p:bg>
  <p:spTree>${EMPTY_GROUP}</p:spTree>
 </p:cSld>
 <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
 <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
 <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`

const masterRels = (ext: string | null): string => `${HEAD}
<Relationships xmlns="${NS_REL}">
 <Relationship Id="rId1" Type="${DOC_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
 <Relationship Id="rId2" Type="${DOC_REL}/theme" Target="../theme/theme1.xml"/>
 ${ext ? `<Relationship Id="rId3" Type="${DOC_REL}/image" Target="../media/image1.${ext}"/>` : ''}
</Relationships>`

const slideLayout = (): string => `${HEAD}
<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">
 <p:cSld name="Пустой"><p:spTree>${EMPTY_GROUP}</p:spTree></p:cSld>
 <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`

const layoutRels = (): string => `${HEAD}
<Relationships xmlns="${NS_REL}">
 <Relationship Id="rId1" Type="${DOC_REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

const slideRels = (): string => `${HEAD}
<Relationships xmlns="${NS_REL}">
 <Relationship Id="rId1" Type="${DOC_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`

function theme(): string {
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const line =
    `<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">${fill}` +
    '<a:prstDash val="solid"/></a:ln>'
  const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>'

  return `${HEAD}
<a:theme xmlns:a="${NS_A}" name="VisioLogos">
 <a:themeElements>
  <a:clrScheme name="VisioLogos">
   <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
   <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
   <a:dk2><a:srgbClr val="000000"/></a:dk2>
   <a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>
   <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
   <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
   <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
   <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
   <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
   <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
   <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
   <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
  </a:clrScheme>
  <a:fontScheme name="VisioLogos">
   <a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
   <a:minorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
  </a:fontScheme>
  <a:fmtScheme name="VisioLogos">
   <a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>
   <a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>
   <a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst>
   <a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst>
  </a:fmtScheme>
 </a:themeElements>
 <a:objectDefaults/>
 <a:extraClrSchemeLst/>
</a:theme>`
}

const xml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
