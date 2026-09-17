import { useEffect, useMemo, useState } from 'react'
import type { SiteCatalogue, SiteModule } from '@shared/site'
import { SITE_NAME, SITE_MODULES, langName } from '@shared/site'
import { useT } from '../state/i18n'
import { useBible } from '../state/store'
import { Modal } from './Modal'
import { Select } from './Select'

interface Step {
  id: string
  got: number
  total: number
  stage: 'download' | 'unpack' | 'import' | 'done' | 'error'
  error?: string
}

function plainReason(error: unknown): string {
  const words = error instanceof Error ? error.message : String(error)
  return words.replace(/^Error invoking remote method '[^']*':\s*/, '').trim()
}

function weigh(bytes: number): string {
  const mb = bytes / 1048576
  if (mb >= 10) return `${Math.round(mb)} МБ`
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} МБ`
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

export function ModulesBox(): React.JSX.Element {
  const t = useT()
  const installed = useBible((s) => s.catalog)

  const [catalogue, setCatalogue] = useState<SiteCatalogue | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState('all')
  const [steps, setSteps] = useState<Record<string, Step>>({})
  const [shown, setShown] = useState(40)

  const have = useMemo(() => new Set(installed.map((one) => one.id)), [installed])

  useEffect(() => {
    let alive = true
    void window.api.modules
      .catalogue()
      .then((data) => alive && setCatalogue(data))
      .catch((error: unknown) => alive && setFailed(plainReason(error)))
    return () => {
      alive = false
    }
  }, [])

  useEffect(
    () =>
      window.api.modules.onProgress((step) =>
        setSteps((was) => ({ ...was, [step.id]: step as Step }))
      ),
    []
  )

  const bibles = useMemo(
    () => (catalogue?.modules ?? []).filter((one) => one.kind === 'bible'),
    [catalogue]
  )

  const langs = useMemo(() => {
    const seen = new Map<string, number>()
    for (const one of bibles) seen.set(one.lang, (seen.get(one.lang) ?? 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [bibles])

  const found = useMemo(() => {
    const words = query.trim().toLowerCase()
    return bibles.filter((one) => {
      if (lang !== 'all' && one.lang !== lang) return false
      if (!words) return true
      return (
        one.name.toLowerCase().includes(words) ||
        one.short.toLowerCase().includes(words) ||
        one.id.toLowerCase().includes(words)
      )
    })
  }, [bibles, query, lang])

  const install = async (one: SiteModule): Promise<void> => {
    setSteps((was) => ({
      ...was,
      [one.id]: { id: one.id, got: 0, total: one.bytes, stage: 'download' }
    }))
    const answer = await window.api.modules.install(one.id)
    if (!answer.ok) {
      setSteps((was) => ({
        ...was,
        [one.id]: { id: one.id, got: 0, total: 0, stage: 'error', error: answer.error }
      }))
      return
    }

  }

  return (
    <Modal title={t('modules.title')} wide>
      <p className="note">{t('modules.lead')}</p>

      {failed !== null && (
        <div className="modules__trouble">
          <p className="note">{t('modules.offline')}</p>
          <p className="note dim">{failed}</p>
          <button onClick={() => void window.api.bible.importDialog()}>
            {t('bible.addModule')}
          </button>
        </div>
      )}

      {catalogue === null && failed === null && (
        <p className="note">{t('modules.reading')}</p>
      )}

      {catalogue !== null && (
        <>
          <div className="modules__tools">
            <input
              className="search"
              value={query}
              placeholder={t('modules.search')}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(40)
              }}
            />
            <Select
              className="select--lang"
              value={lang}
              onChange={(value) => {
                setLang(value)
                setShown(40)
              }}
              options={[
                { value: 'all', label: t('modules.allLangs') },
                ...langs.map(([code, count]) => ({
                  value: code,
                  label: langName(code),
                  hint: String(count)
                }))
              ]}
            />
          </div>

          <div className="modules__found">
            {t('modules.found', { n: found.length })}
          </div>

          <p className="note dim modules__only">{t('bible.onlyTranslations')}</p>

          <div className="modules__list">
            {found.slice(0, shown).map((one) => {
              const step = steps[one.id]
              const done = have.has(one.id) || step?.stage === 'done'
              const busy =
                step && !['done', 'error'].includes(step.stage) ? step : null

              return (
                <div className="module" key={one.id}>
                  <div className="module__body">
                    <div className="module__name">{one.name}</div>
                    <div className="module__about">
                      {[
                        one.short,
                        langName(one.lang),
                        one.books > 0 ? t('modules.books', { n: one.books }) : '',
                        weigh(one.bytes)
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {busy && (
                      <div className="module__bar">
                        <div
                          className="module__bar-fill"
                          style={{
                            width: busy.total
                              ? `${Math.min(100, (busy.got / busy.total) * 100)}%`
                              : '30%'
                          }}
                        />
                      </div>
                    )}
                    {step?.stage === 'error' && (
                      <div className="module__error">{step.error}</div>
                    )}
                  </div>

                  <div className="module__act">
                    {done ? (
                      <>
                        <span className="module__have">{t('modules.have')}</span>
                        <button
                          className="link"
                          title={t('modules.removeHint')}
                          onClick={() => void window.api.bible.remove(one.id)}
                        >
                          {t('modules.remove')}
                        </button>
                      </>
                    ) : busy ? (
                      <span className="module__have">
                        {t(`modules.stage.${busy.stage}`)}
                      </span>
                    ) : (
                      <button onClick={() => void install(one)}>
                        {t('modules.install')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {found.length > shown && (
            <div className="modules__more">
              <button onClick={() => setShown((n) => n + 60)}>
                {t('modules.more', { n: found.length - shown })}
              </button>
            </div>
          )}

          <div className="modules__foot">

            <button
              className="link"
              title={t('modules.fromFileHint')}
              onClick={() => void window.api.bible.openFile()}
            >
              {t('modules.fromFile')}
            </button>
            <button className="link" onClick={() => void window.api.bible.importDialog()}>
              {t('modules.fromDisk')}
            </button>
            <button
              className="link"
              onClick={() => void window.api.app.openSite(SITE_MODULES)}
            >
              {SITE_NAME}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
