import { useEffect, useRef, useState } from 'react'
import type { SongCategory } from '@shared/types'
import { countIn } from '@shared/categories'
import { SEPARATOR, useContextMenu, type MenuEntry } from './ContextMenu'
import { droppedPaths, hasFiles } from '../lib/dropFiles'
import { useT } from '../state/i18n'
import { useSongs } from '../state/songs'

const SPRING_MS = 700

const songs = (): ReturnType<typeof useSongs.getState> => useSongs.getState()

type T = ReturnType<typeof useT>

function useNaming(): {
  editing: string | null
  start: (id: string) => void
  field: (category: SongCategory) => React.JSX.Element
} {
  const [editing, setEditing] = useState<string | null>(null)
  const closed = useRef(false)

  const start = (id: string): void => {
    closed.current = false
    setEditing(id)
  }

  const finish = (category: SongCategory, value: string | null): void => {
    if (closed.current) return
    closed.current = true
    const name = value?.trim() ?? ''
    if (name && name !== category.name) void songs().renameCategory(category.id, name)
    setEditing(null)
  }

  const field = (category: SongCategory): React.JSX.Element => (
    <input
      className="treerow__edit"
      autoFocus
      defaultValue={category.name}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(category, e.currentTarget.value)
        if (e.key === 'Escape') finish(category, null)
      }}
      onBlur={(e) => finish(category, e.target.value)}
    />
  )

  return { editing, start, field }
}

function categoryMenu(
  t: T,
  category: SongCategory,
  at: number,
  total: number,
  rename: () => void,
  opening: boolean
): MenuEntry[] {
  return [
    ...(opening
      ? [{ label: t('common.open'), onClick: () => songs().pickCategory(category.id) }]
      : []),
    { label: t('common.rename'), hint: 'F2', onClick: rename },
    {
      label: t('cats.up'),
      disabled: at <= 0,
      onClick: () => void songs().moveCategory(category.id, -1)
    },
    {
      label: t('cats.down'),
      disabled: at >= total - 1,
      onClick: () => void songs().moveCategory(category.id, 1)
    },
    SEPARATOR,
    {
      label: t('cats.remove'),
      hint: t('cats.removeHint'),
      danger: true,
      onClick: () => void songs().removeCategory(category.id)
    }
  ]
}

export function CategoryList({
  onDropFiles
}: {
  onDropFiles: (files: string[], categoryId: string) => void
}): React.JSX.Element {
  const t = useT()
  const items = useSongs((s) => s.items)
  const categories = useSongs((s) => s.categories)
  const { open, menu } = useContextMenu()
  const naming = useNaming()
  const [over, setOver] = useState<string | null>(null)

  const drop = (e: React.DragEvent, category: SongCategory): void => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)

    if (hasFiles(e)) {
      void droppedPaths(e).then((paths) => {
        if (paths.length > 0) onDropFiles(paths, category.id)
      })
      return
    }

    const data = e.dataTransfer.getData('text/plain')
    if (data.startsWith('item:')) void songs().setCategory([data.slice(5)], category.id)
    else if (data.startsWith('category:')) void songs().placeCategory(data.slice(9), category.id)
  }

  const add = async (): Promise<void> => {
    const id = await songs().addCategory()
    if (id) naming.start(id)
  }

  return (
    <div className="catlist">
      {categories.map((category, at) => (
        <div
          key={category.id}
          role="button"
          tabIndex={0}
          className={`treerow catrow ${over === category.id ? 'is-over' : ''}`}
          title={t('cats.dropHint')}
          draggable={naming.editing !== category.id}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', `category:${category.id}`)}
          onClick={() => naming.editing !== category.id && songs().pickCategory(category.id)}
          onKeyDown={(e) => {
            if (naming.editing === category.id) return
            if (e.key === 'Enter') songs().pickCategory(category.id)
            if (e.key === 'F2') naming.start(category.id)
          }}
          onContextMenu={(e) =>
            open(
              e,
              categoryMenu(t, category, at, categories.length, () => naming.start(category.id), true)
            )
          }
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOver(category.id)
          }}
          onDragLeave={() => setOver((v) => (v === category.id ? null : v))}
          onDrop={(e) => drop(e, category)}
        >
          <span className="catrow__mark" />
          {naming.editing === category.id ? (
            naming.field(category)
          ) : (
            <>
              <span className="treerow__name">{category.name}</span>
              <span className="treerow__meta">{countIn(items, category.id)}</span>
              <span className="catrow__go">›</span>
            </>
          )}
        </div>
      ))}

      <button className="catrow__add" title={t('cats.addHint')} onClick={() => void add()}>
        {t('cats.add')}
      </button>

      {menu}
    </div>
  )
}

export function CategoryHead({ category }: { category: SongCategory }): React.JSX.Element {
  const t = useT()
  const items = useSongs((s) => s.items)
  const categories = useSongs((s) => s.categories)
  const { open, menu } = useContextMenu()
  const naming = useNaming()
  const [springing, setSpringing] = useState(false)
  const spring = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopSpring = (): void => {
    if (spring.current) clearTimeout(spring.current)
    spring.current = null
    setSpringing(false)
  }

  useEffect(() => stopSpring, [])

  const at = categories.findIndex((one) => one.id === category.id)
  const menuEntries = (): MenuEntry[] =>
    categoryMenu(t, category, at, categories.length, () => naming.start(category.id), false)

  return (
    <div className="cathead">
      <button
        className={`cathead__back ${springing ? 'is-over' : ''}`}
        title={t('cats.backHint')}
        onClick={() => songs().pickCategory(null)}
        onDragOver={(e) => {
          if (hasFiles(e)) return
          e.preventDefault()
          if (spring.current) return
          setSpringing(true)
          spring.current = setTimeout(() => {
            spring.current = null
            setSpringing(false)
            songs().pickCategory(null)
          }, SPRING_MS)
        }}
        onDragLeave={stopSpring}
        onDrop={(e) => {
          e.preventDefault()
          stopSpring()
        }}
      >
        <span className="cathead__arrow">←</span>
        {t('cats.back')}
      </button>

      {naming.editing === category.id ? (
        naming.field(category)
      ) : (
        <span
          className="cathead__name"
          title={t('cats.renameHint')}
          onDoubleClick={() => naming.start(category.id)}
          onContextMenu={(e) => open(e, menuEntries())}
        >
          {category.name}
        </span>
      )}

      <span className="treerow__meta">{countIn(items, category.id)}</span>
      <button
        className="cathead__more"
        title={t('cats.more')}
        onClick={(e) => open(e, menuEntries())}
      >
        ⋯
      </button>

      {menu}
    </div>
  )
}
