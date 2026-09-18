import { useCallback, useEffect, useRef, useState } from 'react'
import { waStaffApi } from '../../lib/aiStaffApi'
import { ApiError } from '../../lib/api'
import { toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { playWaHandoffAlert } from './waAlertSound'

const POLL_MS = 2000

function notifyWaiting(item) {
  playWaHandoffAlert()
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification('WhatsApp — admin requested', {
      body: `${item.shopperName || 'Shopper'} (${item.phone || 'WhatsApp'}) wants a real admin${item.summary ? ` — ${item.summary.slice(0, 120)}` : ''}`,
      tag: `wa-waiting-${item.id}`,
      requireInteraction: true,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Browser may block notifications
  }
}

function listStamp(data, items) {
  return data?.listUpdatedAt || data?.updatedAt || items.reduce((latest, row) => {
    const t = row?.updatedAt || ''
    return t > latest ? t : latest
  }, '')
}

function asList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.sessions)) return data.sessions
  if (Array.isArray(data?.items)) return data.items
  return []
}

function isRequest(item) {
  return item?.listKind === 'request' || item?.status === 'waiting_stylist'
}

function splitItems(items) {
  const requests = []
  const human = []
  const ai = []
  const closed = []
  for (const item of items) {
    if (!item?.id) continue
    if (isRequest(item)) requests.push(item)
    else if (item.listKind === 'human' || item.status === 'with_stylist') human.push(item)
    else if (item.status === 'closed') closed.push(item)
    else ai.push(item)
  }
  return { requests, human, ai, closed }
}

export function useWhatsAppInbox({ enabled, notify = false }) {
  const [items, setItems] = useState([])
  const [me, setMe] = useState(null)
  const [accessError, setAccessError] = useState(null)
  const [modalItem, setModalItem] = useState(null)
  const [acceptingId, setAcceptingId] = useState(null)
  const [joiningId, setJoiningId] = useState(null)

  const seenWaiting = useRef(new Set())
  const dismissed = useRef(new Set())
  const primed = useRef(false)
  const abortRef = useRef(null)
  const itemsRef = useRef([])
  const modalRef = useRef(null)
  const sinceRef = useRef('')
  const inFlightRef = useRef(false)
  const listFpRef = useRef('')

  const refresh = useCallback(async () => {
    if (!enabled) return null
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return itemsRef.current
    if (inFlightRef.current) return itemsRef.current
    inFlightRef.current = true
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const sessions = await waStaffApi.sessions({
        limit: 200,
        since: sinceRef.current || undefined,
        signal: ac.signal,
      })
      if (sessions?.unchanged) return itemsRef.current
      const hasList = Array.isArray(sessions)
        || Array.isArray(sessions?.items)
        || Array.isArray(sessions?.sessions)
      if (sinceRef.current && !hasList) return itemsRef.current
      const nextItems = asList(sessions)
      const stamp = listStamp(sessions, nextItems)
      if (stamp) sinceRef.current = stamp
      const fp = nextItems.map((i) => `${i.id}:${i.updatedAt}:${i.status}:${i.listKind || ''}`).join('|')
      if (fp === listFpRef.current) return itemsRef.current
      listFpRef.current = fp
      itemsRef.current = nextItems
      setItems(nextItems)
      setAccessError(null)

      const nextWaiting = nextItems.filter(isRequest)
      const nextIds = new Set(nextWaiting.map((r) => r.id))
      primed.current = true
      if (notify && !modalRef.current) {
        for (const item of nextWaiting) {
          if (!seenWaiting.current.has(item.id) && !dismissed.current.has(item.id)) {
            seenWaiting.current.add(item.id)
            modalRef.current = item
            setModalItem(item)
            notifyWaiting(item)
            break
          }
        }
      }
      for (const id of [...seenWaiting.current]) {
        if (!nextIds.has(id)) seenWaiting.current.delete(id)
      }
      return nextItems
    } catch (e) {
      if (e?.name === 'AbortError') return itemsRef.current
      if (e instanceof ApiError && e.status === 401) {
        try { await supa.auth.refreshSession() } catch { /* next tick retries */ }
        return itemsRef.current
      }
      if (e instanceof ApiError && e.status === 403) {
        setAccessError(e.message || 'WhatsApp inbox access required')
        setItems([])
        itemsRef.current = []
        return null
      }
      console.error('[HILO] WhatsApp inbox poll failed:', e)
      return itemsRef.current
    } finally {
      inFlightRef.current = false
    }
  }, [enabled, notify])

  useEffect(() => {
    if (!enabled) {
      primed.current = false
      seenWaiting.current = new Set()
      abortRef.current?.abort()
      sinceRef.current = ''
      listFpRef.current = ''
      return undefined
    }
    let cancelled = false
    waStaffApi.me().then((profile) => {
      if (!cancelled) setMe(profile)
    }).catch(() => {})

    const tick = () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      refresh()
    }
    tick()
    const t = setInterval(tick, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      abortRef.current?.abort()
    }
  }, [enabled, refresh])

  const dismissModal = useCallback(() => {
    if (modalItem?.id) dismissed.current.add(modalItem.id)
    modalRef.current = null
    setModalItem(null)
  }, [modalItem])

  const accept = useCallback(async (sessionId) => {
    setAcceptingId(sessionId)
    try {
      const data = await waStaffApi.accept(sessionId)
      setModalItem((cur) => (cur?.id === sessionId ? null : cur))
      if (modalRef.current?.id === sessionId) modalRef.current = null
      dismissed.current.add(sessionId)
      sinceRef.current = ''
      listFpRef.current = ''
      toast(true, 'WhatsApp conversation claimed')
      await refresh()
      return data
    } catch (e) {
      toast(false, e?.status === 409 ? 'Already taken' : (e?.message || 'Could not accept'))
      await refresh()
      throw e
    } finally {
      setAcceptingId(null)
    }
  }, [refresh])

  const takeover = useCallback(async (sessionId) => {
    setJoiningId(sessionId)
    try {
      let data
      try {
        data = await waStaffApi.takeover(sessionId)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          await waStaffApi.handoff(sessionId)
          data = await waStaffApi.accept(sessionId)
        } else {
          throw e
        }
      }
      setModalItem((cur) => (cur?.id === sessionId ? null : cur))
      if (modalRef.current?.id === sessionId) modalRef.current = null
      dismissed.current.add(sessionId)
      sinceRef.current = ''
      listFpRef.current = ''
      toast(true, 'Joined WhatsApp thread')
      await refresh()
      return data
    } catch (e) {
      toast(false, e?.message || 'Could not take over')
      await refresh()
      throw e
    } finally {
      setJoiningId(null)
    }
  }, [refresh])

  const groups = splitItems(items)

  return {
    items,
    requests: groups.requests,
    human: groups.human,
    ai: groups.ai,
    closed: groups.closed,
    waiting: groups.requests,
    mine: groups.human,
    history: [...groups.ai, ...groups.closed],
    me,
    accessError,
    modalItem,
    dismissModal,
    accept,
    join: takeover,
    takeover,
    acceptingId,
    joiningId,
    refresh,
    badge: groups.requests.length,
  }
}
