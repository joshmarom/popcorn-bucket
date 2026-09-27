import type { OnCompletedListenerDetails, OnErrorOccurredListenerDetails, Session } from 'electron'

export type VidkingNetEvent = {
  at: string
  phase: 'completed' | 'error'
  url: string
  method?: string
  resourceType?: string
  statusCode?: number
  error?: string
}

const MAX_EVENTS = 200
const events: VidkingNetEvent[] = []
let installed = false

function isVidkingDiagnosticsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return (
      u.hostname === 'vidking.net' ||
      u.hostname.endsWith('.vidking.net') ||
      u.hostname === 'videasy.net' ||
      u.hostname.endsWith('.videasy.net') ||
      u.hostname.endsWith('.dolesdao.com') ||
      u.hostname.endsWith('.workers.dev')
    )
  } catch {
    return false
  }
}

function pushEvent(next: VidkingNetEvent): void {
  events.push(next)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

function mapCompleted(d: OnCompletedListenerDetails): VidkingNetEvent {
  return {
    at: new Date().toISOString(),
    phase: 'completed',
    url: d.url,
    method: d.method,
    resourceType: d.resourceType,
    statusCode: d.statusCode
  }
}

function mapError(d: OnErrorOccurredListenerDetails): VidkingNetEvent {
  return {
    at: new Date().toISOString(),
    phase: 'error',
    url: d.url,
    method: d.method,
    resourceType: d.resourceType,
    error: d.error
  }
}

export function installVidkingDiagnosticsHooks(ses: Session): void {
  if (installed) return
  installed = true
  const filter = {
    urls: [
      '*://*.vidking.net/*',
      '*://*.videasy.net/*',
      '*://*.dolesdao.com/*',
      '*://*.workers.dev/*'
    ]
  }
  ses.webRequest.onCompleted(filter, (d) => {
    if (!isVidkingDiagnosticsUrl(d.url)) return
    pushEvent(mapCompleted(d))
  })
  ses.webRequest.onErrorOccurred(filter, (d) => {
    if (!isVidkingDiagnosticsUrl(d.url)) return
    pushEvent(mapError(d))
  })
}

export function readVidkingDiagnostics(): VidkingNetEvent[] {
  return [...events].reverse()
}
