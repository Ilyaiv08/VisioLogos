import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  Countdown,
  LowerThird,
  Slide,
  SlideBlock,
  SlideStyle,
  SlideTail
} from '@shared/types'
import { backgroundCss, textShadowCss } from '@shared/backgrounds'
import { DEFAULT_ASPECT, MAX_FONT_VH } from '@shared/slide'
import { askFont, useDevicePixelRatio, useFontTick } from '../lib/slideFonts'

export const STAGE_W = 1920

const MARGIN = 0.99

interface Props {
  slide: Slide | null

  blackout?: boolean

  hideText?: boolean

  lowerThird?: LowerThird | null

  showSafeArea?: boolean

  aspect?: number
  className?: string
}

export function SlideView({
  slide,
  blackout = false,
  hideText = false,
  lowerThird = null,
  showSafeArea = false,
  aspect,
  className
}: Props): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [fontPx, setFontPx] = useState(0)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const fontTick = useFontTick()
  const unit = 1 / useDevicePixelRatio()

  const style = slide?.style
  const contentKey = slide
    ? `${slide.id}|${slide.blocks.map((b) => b.html).join('|')}|${
        slide.secondary?.blocks.map((b) => b.html).join('|') ?? ''
      }`
    : ''

  const ratio =
    aspect && aspect > 0 ? aspect : box.w > 0 && box.h > 0 ? box.w / box.h : DEFAULT_ASPECT
  const stageW = STAGE_W * unit
  const stageH = (STAGE_W / ratio) * unit
  const scale = box.w / stageW

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return

    const measure = (): void =>
      setBox((was) =>
        was.w === el.clientWidth && was.h === el.clientHeight
          ? was
          : { w: el.clientWidth, h: el.clientHeight }
      )

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const text = textRef.current
    const stage = stageRef.current
    if (!text || !stage || !style) return

    askFont(style.fontFamily, style.bold)

    const fit = (): void => {
      const height = stageH
      const room = stageH - padY * 2 - reserve

      const turned = stage.style.transform
      const capped = text.style.maxHeight
      stage.style.transform = 'none'
      text.style.maxHeight = 'none'

      const apply = (vh: number): boolean => {
        text.style.fontSize = `${(height * vh) / 100}px`

        return text.getBoundingClientRect().height <= room + unit
      }

      const fill = style.fitToScreen !== false
      const ceiling = fill ? (style.maxFontSizeVh ?? MAX_FONT_VH) : style.fontSizeVh

      let best = style.minFontSizeVh
      if (apply(ceiling)) {
        best = ceiling
      } else {
        let lo = style.minFontSizeVh
        let hi = ceiling

        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2
          if (apply(mid)) {
            best = mid
            lo = mid
          } else {
            hi = mid
          }
        }
      }
      best = Math.max(style.minFontSizeVh, best * MARGIN)
      apply(best)
      text.style.maxHeight = capped
      stage.style.transform = turned
      setFontPx((height * best) / 100)
    }

    fit()

  }, [contentKey, style, stageH, unit, fontTick, blackout, hideText])

  const refPx = fontPx
    ? fontPx * (style?.referenceScale ?? 0.6)
    : style
      ? (stageH * style.fontSizeVh * style.referenceScale) / 100
      : 0

  const reserve =
    (style?.showReference && slide?.reference) || slide?.tail ? refPx * 1.5 : 0

  const padX = style ? (stageW * style.paddingPct) / 100 : 0
  const padY = style ? (stageH * style.paddingPct) / 100 : 0

  const video = slide?.background.kind === 'video' && !blackout ? slide.background.src : null
  const fill =
    blackout || !slide || video ? '#000' : backgroundCss(slide.background)
  const textVisible = slide && !blackout && !hideText

  const rules = Boolean(style?.dividers) && (slide?.blocks.length ?? 0) > 0

  return (
    <div
      className={`slide ${className ?? ''}`}
      ref={boxRef}
      style={{
        background: fill,

        aspectRatio: aspect && aspect > 0 ? String(aspect) : undefined
      }}
    >
      {video && <video className="slide__video" src={video} autoPlay loop muted />}

      {showSafeArea && <div className="slide__safe-area" />}

      <div
        ref={stageRef}
        className="slide__stage"
        style={{ width: stageW, height: stageH, transform: `scale(${scale})` }}
      >
        {textVisible && style && (
          <div
            className={`slide__body slide__body--${slide.vertical ?? 'center'}`}
            style={{
              padding: `${padY}px ${padX}px`,
              paddingBottom: `${padY + reserve}px`
            }}
          >
            <div
              ref={textRef}
              className={`slide__text ${slide.plate ? `slide__text--plate-${slide.plate}` : ''}`}
              style={{
                fontFamily: style.fontFamily,
                fontSize: fontPx ? `${fontPx}px` : undefined,
                fontWeight: style.bold ? 700 : 400,
                lineHeight: style.lineHeight,
                color: style.color,
                textAlign: style.align,
                textTransform: style.uppercase ? 'uppercase' : 'none',
                textShadow: style.shadow ? textShadowCss(style.color) : 'none'
              }}
            >
              {rules && <Divider color={style.color} />}
              {slide.countdown ? (
                <CountdownText countdown={slide.countdown} />
              ) : (
                <Blocks blocks={slide.blocks} style={style} />
              )}

              {slide.secondary && slide.secondary.blocks.length > 0 && (
                <>
                  {style.dividers && <Divider color={style.color} />}
                  <div className="slide__secondary">
                    <Blocks blocks={slide.secondary.blocks} style={style} />
                  </div>
                </>
              )}
              {rules && <Divider color={style.color} />}
            </div>
          </div>
        )}

        {lowerThird && !blackout && (
          <div className="slide__lower">
            <span>{lowerThird.text}</span>
          </div>
        )}

        {textVisible && style && slide.tail && (
          <div
            className="slide__tail"
            style={{
              color: style.color,
              bottom: `${style.paddingPct * 0.42}%`,
              fontSize: refPx ? `${refPx}px` : undefined,
              textShadow: style.shadow ? textShadowCss(style.color) : 'none'
            }}
          >
            <TailMark tail={slide.tail} color={style.color} />
          </div>
        )}

        {textVisible && style?.showReference && slide.reference && (
          <div
            className="slide__reference"
            style={{
              color: style.color,
              bottom: `${style.paddingPct * 0.42}%`,
              right: `${style.paddingPct * 0.7}%`,
              fontSize: refPx ? `${refPx}px` : undefined,
              textShadow: style.shadow ? textShadowCss(style.color) : 'none'
            }}
          >
            {slide.reference}
          </div>
        )}
      </div>
    </div>
  )
}

function Blocks({
  blocks,
  style
}: {
  blocks: SlideBlock[]
  style: SlideStyle
}): React.JSX.Element {
  return (
    <>
      {blocks.map((block, i) => {
        return (
          <p
            key={i}
            className="slide__block"
            style={{
              fontSize: block.scale && block.scale !== 1 ? `${block.scale}em` : undefined
            }}
          >
            {block.clock ? (
              <Clock />
            ) : (
              <>
                {style.showVerseNumbers && block.verse !== undefined && (
                  <span className="slide__vn">{block.verse}. </span>
                )}
                <span dangerouslySetInnerHTML={{ __html: block.html }} />
              </>
            )}
          </p>
        )
      })}
    </>
  )
}

function TailMark({ tail, color }: { tail: SlideTail; color: string }): React.JSX.Element {
  if (tail.kind === 'end') {
    return <span className="slide__tail-line" style={{ background: color }} />
  }

  return <span className="slide__tail-more">▾{tail.label ? ` ${tail.label}` : ''}</span>
}

function CountdownText({ countdown }: { countdown: Countdown }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const left = Math.max(0, countdown.endsAt - now)
  if (left === 0) {
    return <p className="slide__block">{countdown.finishedText}</p>
  }

  const total = Math.ceil(left / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')

  return (
    <>
      {countdown.caption && <p className="slide__block slide__caption">{countdown.caption}</p>}
      <p className="slide__block slide__clock">
        {mm}:{ss}
      </p>
    </>
  )
}

function Clock(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
    </>
  )
}

function Divider({ color }: { color: string }): React.JSX.Element {
  return <div className="slide__divider" style={{ background: color }} />
}
