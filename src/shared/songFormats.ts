export type SongFormat = 'text' | 'pptx' | 'pdf' | 'opensong' | 'openlyrics'

export interface FormatInfo {

  name: string
  extension: string
}

export const FORMATS: Record<SongFormat, FormatInfo> = {
  text: { name: 'Текст', extension: 'txt' },
  pptx: { name: 'PowerPoint', extension: 'pptx' },
  pdf: { name: 'PDF', extension: 'pdf' },
  opensong: { name: 'OpenSong', extension: 'xml' },
  openlyrics: { name: 'OpenLyrics', extension: 'xml' }
}

export const FORMAT_ORDER: SongFormat[] = ['text', 'pptx', 'pdf', 'opensong', 'openlyrics']
