export type TextFormat = 'text' | 'pdf' | 'pptx'

export interface TextFormatInfo {
  name: string
  extension: string
}

export const TEXT_FORMATS: Record<TextFormat, TextFormatInfo> = {
  text: { name: 'Текст', extension: 'txt' },
  pdf: { name: 'PDF', extension: 'pdf' },
  pptx: { name: 'PowerPoint', extension: 'pptx' }
}

export const TEXT_FORMAT_ORDER: TextFormat[] = ['text', 'pdf', 'pptx']
