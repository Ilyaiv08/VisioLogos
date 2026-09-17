import { createModel, type Model, type KaldiRecognizer } from 'vosk-browser'

const RATE = 16_000

const CHUNK = 4096

const LEVEL_EVERY = 200

const MODEL_URL = 'visio://voice/model.zip'

const log = (line: string): void => {
  const box = document.getElementById('log')
  if (box) box.textContent = `${line}\n${box.textContent ?? ''}`.slice(0, 4000)
}

let model: Model | null = null
let recognizer: KaldiRecognizer | null = null
let stream: MediaStream | null = null
let ctx: AudioContext | null = null
let node: ScriptProcessorNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let sink: GainNode | null = null

let told = 'off'
let levelAt = 0

function say(status: { state: string; error?: string; using?: string }): void {
  if (status.state !== told) log(status.state + (status.error ? `: ${status.error}` : ''))
  told = status.state
  window.api.voice.status(status)
}

async function devices(): Promise<void> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    const inputs = all
      .filter((one) => one.kind === 'audioinput')
      .map((one, i) => ({ id: one.deviceId, label: one.label || `Вход ${i + 1}` }))
    window.api.voice.status({ state: told, devices: inputs })
  } catch (error) {
    say({ state: 'error', error: String(error) })
  }
}

async function start(deviceId?: string | null, grammar?: string | null): Promise<void> {
  await stop()
  say({ state: 'loading' })

  try {

    model ??= await createModel(MODEL_URL)
    recognizer = makeRecognizer(grammar)

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: 1,

        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    const using = stream.getAudioTracks()[0]?.label ?? ''

    ctx = new AudioContext({ sampleRate: RATE })
    source = ctx.createMediaStreamSource(stream)
    node = ctx.createScriptProcessor(CHUNK, 1, 1)
    node.onaudioprocess = (event) => onSound(event.inputBuffer.getChannelData(0))

    sink = ctx.createGain()
    sink.gain.value = 0
    source.connect(node)
    node.connect(sink)
    sink.connect(ctx.destination)
    await ctx.resume()

    say({ state: 'listening', using })
    await devices()
  } catch (error) {
    await stop()
    say({ state: 'error', error: reason(error) })
  }
}

function makeRecognizer(grammar?: string | null): KaldiRecognizer {
  if (!model) throw new Error('модель не загружена')

  const made = grammar
    ? new model.KaldiRecognizer(RATE, grammar)
    : new model.KaldiRecognizer(RATE)
  made.setWords(true)

  made.on('partialresult', (message) => {
    const result = 'result' in message ? (message.result as { partial?: string }) : null
    if (result?.partial) window.api.voice.heard(result.partial, false)
  })
  made.on('result', (message) => {
    const result = 'result' in message ? (message.result as { text?: string }) : null
    if (result?.text) window.api.voice.heard(result.text, true)
  })
  made.on('error', (message) => {
    say({ state: 'error', error: String((message as { error?: unknown }).error ?? message) })
  })

  return made
}

function onSound(data: Float32Array): void {
  if (!recognizer) return

  try {
    recognizer.acceptWaveformFloat(new Float32Array(data), RATE)
  } catch {

  }

  const now = performance.now()
  if (now - levelAt < LEVEL_EVERY) return
  levelAt = now

  let sum = 0
  for (const value of data) sum += value * value
  const level = Math.min(1, Math.sqrt(sum / data.length) * 6)
  window.api.voice.status({ state: told, level })
}

async function stop(): Promise<void> {
  node?.disconnect()
  source?.disconnect()
  sink?.disconnect()
  if (node) node.onaudioprocess = null

  stream?.getTracks().forEach((track) => track.stop())
  if (ctx) await ctx.close().catch(() => undefined)
  recognizer?.remove()

  recognizer = null
  node = null
  source = null
  sink = null
  stream = null
  ctx = null
}

function reason(error: unknown): string {
  const name = (error as { name?: string })?.name
  if (name === 'NotAllowedError') return 'нет доступа к микрофону'
  if (name === 'NotFoundError') return 'микрофон не найден'
  if (name === 'NotReadableError') return 'микрофон занят другой программой'
  return error instanceof Error ? error.message : String(error)
}

window.api.voice.onCommand((command) => {
  if (command.do === 'start') void start(command.deviceId, command.grammar)
  else if (command.do === 'stop') void stop().then(() => say({ state: 'off' }))
  else if (command.do === 'devices') void devices()
  else if (command.do === 'grammar') {

    if (!model || !ctx) return
    try {
      recognizer?.remove()
      recognizer = makeRecognizer(command.grammar)
    } catch (error) {
      say({ state: 'error', error: reason(error) })
    }
  }
})

void devices()
