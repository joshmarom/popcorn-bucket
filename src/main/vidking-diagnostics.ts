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

/** Successful loads of these are noise; their failures are still recorded. */
const QUIET_RESOURCE_TYPES = new Set(['image', 'font', 'stylesheet'])

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
  // The session is dedicated to the embed and its stream/CDN hosts rotate, so every
  // request is in scope rather than a fixed host list.
  const filter = { urls: ['*://*/*'] }
  ses.webRequest.onCompleted(filter, (d) => {
    if (d.statusCode < 400 && QUIET_RESOURCE_TYPES.has(d.resourceType)) return
    pushEvent(mapCompleted(d))
  })
  ses.webRequest.onErrorOccurred(filter, (d) => {
    pushEvent(mapError(d))
  })
}

export function readVidkingDiagnostics(): VidkingNetEvent[] {
  return [...events].reverse()
}
