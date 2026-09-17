import type { DisplayInfo, OutputRole } from './types'

export const ROLES: OutputRole[] = ['hall', 'stage', 'stream']

export const isRole = (value: unknown): value is OutputRole =>
  ROLES.includes(value as OutputRole)

export interface Screen {
  id: number
}

export interface Assignment {
  role: OutputRole
  displayId: number
}

export const screenLabel = (screen: DisplayInfo): string =>
  `${screen.resolution.width} × ${screen.resolution.height}`

export function screenAspect(screen: DisplayInfo): number | null {
  const { width, height } = screen.bounds
  return width > 0 && height > 0 ? width / height : null
}

export function previewScreen(
  screens: DisplayInfo[],
  wanted: number | null,
  hallId: number | null
): number | null {
  if (screens.length === 0) return null
  if (wanted !== null && screens.some((one) => one.id === wanted)) return wanted

  const hall = hallId !== null ? screens.find((one) => one.id === hallId) : null
  return (hall ?? screens.find((one) => one.isPrimary) ?? screens[0]).id
}

export const showsWindowed = (displayId: number, controlId: number | null): boolean =>
  controlId !== null && displayId === controlId

export const otherScreens = <T extends Screen>(screens: T[], controlId: number | null): T[] =>
  screens.filter((screen) => screen.id !== controlId)

export function defaultScreen<T extends Screen>(
  screens: T[],
  controlId: number | null
): T | null {
  return otherScreens(screens, controlId)[0] ?? screens[0] ?? null
}

export function fallbackScreen<T extends Screen>(
  screens: T[],
  controlId: number | null
): T | null {
  return defaultScreen(screens, controlId)
}

export function movable(
  open: (Assignment & { windowed: boolean })[],
  screens: Screen[],
  controlId: number | null
): Assignment[] {

  const busy = new Set(
    open.filter((entry) => entry.displayId !== controlId).map((entry) => entry.displayId)
  )
  const spare = otherScreens(screens, controlId).filter((screen) => !busy.has(screen.id))
  if (spare.length === 0) return []

  const waiting = open
    .filter((entry) => entry.windowed && entry.displayId === controlId)
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))

  return waiting
    .slice(0, spare.length)
    .map((entry, i) => ({ role: entry.role, displayId: spare[i].id }))
}

export function restorePlan(
  saved: unknown,
  screens: Screen[],
  controlId: number | null
): Assignment[] {
  if (!Array.isArray(saved)) return []

  const others = otherScreens(screens, controlId)
  if (others.length === 0) return []

  const plan: Assignment[] = []
  for (const item of saved) {
    const role = (item as Assignment | null)?.role
    if (!isRole(role) || plan.some((p) => p.role === role)) continue

    const remembered = others.find((screen) => screen.id === (item as Assignment).displayId)
    const screen = remembered ?? (others.length === 1 ? others[0] : null)
    if (screen) plan.push({ role, displayId: screen.id })
  }
  return plan
}
