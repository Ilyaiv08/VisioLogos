type Stepper = (delta: number) => Promise<void>

let stepper: Stepper | null = null

export function ownsScreen(step: Stepper): void {
  stepper = step
}

export function releaseScreen(): void {
  stepper = null
}

export async function stepOnScreen(delta: number): Promise<boolean> {
  const step = stepper
  if (!step) return false
  await step(delta)
  return true
}
