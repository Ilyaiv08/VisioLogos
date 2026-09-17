import type { Deck, Slide, SlideStyle } from './types'

export const deckSlideUrl = (deckId: string, slide: string): string =>
  `visio://deck/${encodeURIComponent(deckId)}/${encodeURIComponent(slide)}`

export function deckSlides(deck: Deck, style: SlideStyle): Slide[] {

  const clean: SlideStyle = {
    ...style,
    dividers: false,
    showReference: false,
    showVerseNumbers: false
  }

  return deck.slides.map((slide, i) => ({
    id: `${deck.id}-${i}`,
    kind: 'text' as const,
    blocks: [],
    background: {
      kind: 'image' as const,
      src: deckSlideUrl(deck.id, slide),
      fit: 'contain' as const
    },
    style: clean
  }))
}
