import { useState } from 'react'
import type { Background, BackgroundItem, SlideStyle } from '@shared/types'
import {
  backgroundCss,
  backgroundName,
  colorForLuminance,
  readableOn
} from '@shared/backgrounds'
import type { Key } from '@shared/i18n'
import { ptOfVh, TEXT_SIZES, vhOfPt } from '@shared/slide'
import { brightnessOf } from '../lib/backLight'
import { ColorPicker } from './ColorPicker'
import { Select } from './Select'
import { allBackgrounds, useLook } from '../state/look'
import { useT } from '../state/i18n'
import { useLive } from '../state/live'

type SettingsTab = 'font' | 'text' | 'background' | 'templates'

const TABS: SettingsTab[] = ['font', 'text', 'background', 'templates']

const TAB_KEY = {
  font: 'control.font',
  text: 'control.text',
  background: 'control.bg',
  templates: 'control.templates'
} as const

const ALIGN_KEY = {
  left: 'control.alignLeft',
  center: 'control.alignCenter',
  right: 'control.alignRight'
} as const

const FONTS: { value: string; label: string; key?: Key }[] = [
  { value: "'Onest Variable', 'Segoe UI', sans-serif", label: 'Onest', key: 'control.fontOnest' },
  { value: "'Inter Variable', 'Segoe UI', sans-serif", label: 'Inter', key: 'control.fontInter' },
  { value: "'Literata Variable', Georgia, serif", label: 'Literata', key: 'control.fontLiterata' },
  { value: "'PT Serif', Georgia, serif", label: 'PT Serif', key: 'control.fontPtSerif' },
  { value: '"Segoe UI", Arial, sans-serif', label: 'Segoe UI' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, sans-serif', label: 'Verdana' }
]

export interface ControlTarget {

  style: SlideStyle
  background: Background
  setStyle: (patch: Partial<SlideStyle>) => void
  setBackground: (background: Background) => void

  reset: () => void

  label: string
  resetLabel: string

  ownBackground?: {
    on: boolean
    set: (on: boolean) => void
    label: string
    hint: string
  }
}

interface Props {

  nav?: React.ReactNode
  onShow: () => void
  canShow: boolean
  target: ControlTarget
}

export function ControlPanel({ nav, onShow, canShow, target }: Props): React.JSX.Element {
  const t = useT()
  const live = useLive((s) => s.live)
  const liveActions = useLive()

  return (
    <div className="control">
      {nav}

      <div className="control__main">
        <button
          className="btn-show"
          onClick={onShow}
          disabled={!canShow}
          title={t('common.space')}
        >
          {t('common.show')}
        </button>
        <button
          className="btn-hide"
          onClick={() => void liveActions.clear()}
          disabled={!live.slide}
          title="Esc"
        >
          {t('common.hide')}
        </button>
      </div>

      <ScreenChips />

      <LookTabs target={target} />
    </div>
  )
}

export function ScreenChips(): React.JSX.Element {
  const t = useT()
  const live = useLive((s) => s.live)
  const actions = useLive()

  return (
    <>
      <div className="control__pair">
        <button
          className={`chip ${live.blackout ? 'is-on' : ''}`}
          onClick={() => void actions.toggleBlackout()}
        >
          {t('control.blackout')} <kbd>B</kbd>
        </button>
        <button
          className={`chip ${live.hideText ? 'is-on' : ''}`}
          onClick={() => void actions.toggleHideText()}
        >
          {t('control.bgOnly')} <kbd>T</kbd>
        </button>
      </div>

      {live.lowerThird && (
        <button
          className="chip chip--wide is-on"
          onClick={() => void actions.clearLowerThird()}
          title={live.lowerThird.text}
        >
          {t('control.clearLower')}
        </button>
      )}
    </>
  )
}

export function LookTabs({ target }: { target: ControlTarget }): React.JSX.Element {
  const t = useT()
  const [tab, setTab] = useState<SettingsTab>('background')

  return (
    <>
      <div className="control__target" title={t('control.whatBelow')}>
        {t('control.look')} <b>{target.label}</b>
      </div>

      <div className="subtabs">
        {TABS.map((id) => (
          <button
            key={id}
            className={`subtabs__item ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(TAB_KEY[id])}
          </button>
        ))}
      </div>

      <div className="control__body">
        {tab === 'font' && <FontTab target={target} />}
        {tab === 'text' && <TextTab target={target} />}
        {tab === 'background' && <BackgroundTab target={target} />}
        {tab === 'templates' && <TemplatesTab target={target} />}
      </div>
    </>
  )
}

function FontTab({ target }: { target: ControlTarget }): React.JSX.Element {
  const t = useT()
  const { style, background, setStyle } = target

  const pickForBackground = async (): Promise<void> => {
    const back = await brightnessOf(background)
    setStyle({ color: back === null ? '#ffffff' : colorForLuminance(back) })
  }

  return (
    <>
      <div className="field">
        {t('control.family')}
        <Select
          value={style.fontFamily}
          onChange={(v) => setStyle({ fontFamily: v })}
          options={FONTS.map((f) => ({
            value: f.value,
            label: f.key ? t(f.key) : f.label,
            style: { fontFamily: f.value }
          }))}
        />
      </div>

      <div className="field">
        {t('control.size')}
        <Select
          value={String(nearestSize(ptOfVh(style.fontSizeVh)))}
          onChange={(v) => setStyle({ fontSizeVh: vhOfPt(Number(v)) })}
          options={TEXT_SIZES.map((pt) => ({ value: String(pt), label: String(pt) }))}
        />
      </div>

      <Check
        label={t('control.fitScreen')}
        hint={t('control.fitScreenHint')}
        checked={style.fitToScreen !== false}
        onChange={(v) => setStyle({ fitToScreen: v })}
      />

      <Slider
        label={t('control.minSize')}
        hint={t('control.minSizeHint')}
        value={style.minFontSizeVh}
        min={2}
        max={8}
        step={0.2}
        onChange={(v) => setStyle({ minFontSizeVh: v })}
      />

      <div className="field">
        {t('control.color')}
        <ColorPicker
          value={style.color}
          onChange={(hex) => setStyle({ color: hex })}
          onPickForBackground={() => void pickForBackground()}
        />
      </div>

      <Check
        label={t('control.bold')}
        checked={style.bold}
        onChange={(v) => setStyle({ bold: v })}
      />
      <Check
        label={t('control.shadow')}
        hint={t('control.shadowHint')}
        checked={style.shadow}
        onChange={(v) => setStyle({ shadow: v })}
      />
      <Check
        label={t('control.uppercase')}
        checked={style.uppercase}
        onChange={(v) => setStyle({ uppercase: v })}
      />
    </>
  )
}

function TextTab({ target }: { target: ControlTarget }): React.JSX.Element {
  const t = useT()
  const { style, setStyle, reset, resetLabel } = target

  return (
    <>
      <div className="field">
        {t('control.align')}
        <div className="segmented">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              className={style.align === a ? 'is-active' : ''}
              onClick={() => setStyle({ align: a })}
            >
              {t(ALIGN_KEY[a])}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={t('control.lineHeight')}
        value={style.lineHeight}
        min={1}
        max={2}
        step={0.05}
        onChange={(v) => setStyle({ lineHeight: v })}
      />
      <Slider
        label={t('control.padding')}
        hint={t('control.safeArea')}
        value={style.paddingPct}
        min={2}
        max={14}
        step={0.5}
        onChange={(v) => setStyle({ paddingPct: v })}
      />

      <Check
        label={t('control.verseNumbers')}
        checked={style.showVerseNumbers}
        onChange={(v) => setStyle({ showVerseNumbers: v })}
      />
      <Check
        label={t('control.reference')}
        checked={style.showReference}
        onChange={(v) => setStyle({ showReference: v })}
      />
      {style.showReference && (
        <>
          <Slider
            label={t('control.referenceSize')}
            hint={t('control.referenceSizeHint')}
            value={style.referenceScale}
            min={0.3}
            max={1.2}
            step={0.05}
            onChange={(v) => setStyle({ referenceScale: v })}
          />
          <div className="field">
            {t('control.referenceKind')}
            <div className="segmented">
              {(
                [
                  ['full', 'control.refFull', 'control.refFullEg'],
                  ['short', 'control.refShort', 'control.refShortEg'],
                  ['latin', 'control.refLatin', 'control.refLatinEg']
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  title={t(hint)}
                  className={style.referenceFormat === value ? 'is-active' : ''}
                  onClick={() => setStyle({ referenceFormat: value })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <Check
        label={t('control.dividers')}
        checked={style.dividers}
        onChange={(v) => setStyle({ dividers: v })}
      />

      <button className="wide ghost" onClick={reset}>
        {resetLabel}
      </button>
    </>
  )
}

function BackgroundTab({ target }: { target: ControlTarget }): React.JSX.Element {
  const t = useT()
  const { style, background, setBackground, setStyle } = target
  const { userBackgrounds, addBackgrounds, deleteBackground } = useLook()
  const items = allBackgrounds(userBackgrounds)
  const current = JSON.stringify(background)

  const pick = async (bg: Background): Promise<void> => {
    setBackground(bg)

    const back = await brightnessOf(bg)
    if (back === null || readableOn(style.color, back)) return

    const color = colorForLuminance(back)
    if (color !== style.color) setStyle({ color })
  }

  const group = (of: BackgroundItem[]): React.JSX.Element => (
    <div className="gallery">
      {of.map((item) => (
        <BackgroundCell
          key={item.id}
          item={item}
          active={JSON.stringify(item.background) === current}
          onPick={() => void pick(item.background)}
          onDelete={item.builtin ? undefined : () => void deleteBackground(item.id)}
        />
      ))}
    </div>
  )

  const own = items.filter((item) => !item.builtin)
  const scope = target.ownBackground

  return (
    <>

      {scope && (
        <label className="bgscope" title={scope.hint}>
          <input
            type="checkbox"
            checked={scope.on}
            onChange={(e) => scope.set(e.target.checked)}
          />
          <span>{scope.label}</span>
        </label>
      )}

      <div className="gallery__title">{t('control.bgDark')}</div>
      {group(items.filter((item) => item.tone === 'dark'))}

      <div className="gallery__title">{t('control.bgLight')}</div>
      {group(items.filter((item) => item.tone === 'light'))}

      {own.length > 0 && (
        <>
          <div className="gallery__title">{t('control.bgOwn')}</div>
          {group(own)}
        </>
      )}

      <button
        className="wide"
        title={t('control.bgAddHint')}
        onClick={() => void addBackgrounds()}
      >
        {t('control.bgAdd')}
      </button>
    </>
  )
}

function BackgroundCell({
  item,
  active,
  onPick,
  onDelete
}: {
  item: BackgroundItem
  active: boolean
  onPick: () => void
  onDelete?: () => void
}): React.JSX.Element {
  const t = useT()

  return (
    <div className={`gallery__cell ${active ? 'is-active' : ''}`}>
      <button
        className="gallery__thumb"
        style={{ background: backgroundCss(item.background) }}
        title={backgroundName(item)}
        onClick={onPick}
      >
        {item.background.kind === 'video' && (
          <span className="gallery__badge">{t('control.bgVideo')}</span>
        )}
      </button>
      {onDelete && (
        <button className="gallery__x" title={t('control.bgRemove')} onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  )
}

function TemplatesTab({ target }: { target: ControlTarget }): React.JSX.Element {
  const t = useT()
  const { templates, deleteTemplate, saveTemplate } = useLook()
  const [name, setName] = useState('')

  return (
    <>
      <div className="gallery">
        {templates.map((tpl) => (
          <div key={tpl.id} className="gallery__cell">
            <button
              className="gallery__thumb gallery__thumb--tpl"
              style={{ background: backgroundCss(tpl.background) }}
              title={t('control.templateApply', { name: tpl.name })}
              onClick={() => {
                target.setStyle(tpl.style)
                target.setBackground(tpl.background)
              }}
            >
              <span
                style={{
                  fontFamily: tpl.style.fontFamily,
                  color: tpl.style.color,
                  fontWeight: tpl.style.bold ? 700 : 400
                }}
              >
                {t('control.sample')}
              </span>
            </button>
            <button className="gallery__x" onClick={() => deleteTemplate(tpl.id)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <input
        placeholder={t('control.templateName')}
        title={t('control.templatesHint')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="wide"
        onClick={() => {
          saveTemplate(name, target.style, target.background)
          setName('')
        }}
      >
        {t('control.templateSave')}
      </button>
    </>
  )
}

function nearestSize(pt: number): number {
  return TEXT_SIZES.reduce((best, one) =>
    Math.abs(one - pt) < Math.abs(best - pt) ? one : best
  )
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <label className="field" title={hint}>
      <span className="field__head">
        {label}
        <b>{value.toFixed(step < 0.1 ? 2 : 1)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Check({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <label className="checkbox" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
