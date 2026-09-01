import { useCallback, useEffect, useRef, useState } from 'react'
import { aiStaffApi } from '../../lib/aiStaffApi'
import { ApiError } from '../../lib/api'
import { toast } from '../../lib/designTokens'

const POLL_MS = 4000

function notifyWaiting(item) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification('Stylist inbox', {
      body: `${item.shopperName || 'Shopper'} is waiting${item.summary ? ` — ${item.summary.slice(0, 120)}` : ''}`,
      tag: `stylist-waiting-${item.id}`,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Browser may block notifications
  }
}

export function memberHasStylistInbox(member) {
  if (!member) return false
  if (member.stylist_inbox === true) return true
  const role = String(member.role || '').toLowerCase()
  if (['admin', 'founder', 'super_admin', 'superadmin', 'stylist'].includes(role)) return true
  const tabs = member.tabs || []
  return tabs.includes('stylist-inbox')
}

export function useStylistInbox({ enabled }) {
  const [waiting, setWaiting] = useState([])
  const [mine, setMine] = useState([])
  const [me, setMe] = useState(null)
  const [accessError, setAccessError] = useState(null)
  const [modalItem, setModalItem] = useState(null)
  const [acceptingId, setAcceptingId] = useState(null)

  const seenWaiting = useRef(new Set())
  const dismissed = useRef(new Set())
  const primed = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled) return null
    try {
      const data = await aiStaffApi.inbox()
      const nextWaiting = data?.waiting || []
      const nextMine = data?.mine || []
      setWaiting(nextWaiting)
      setMine(nextMine)
      setAccessError(null)

      const nextIds = new Set(nextWaiting.map((r) => r.id))
      if (!primed.current) {
        nextWaiting.forEach((r) => seenWaiting.current.add(r.id))
        primed.current = true
      } else {
        for (const item of nextWaiting) {
          if (!seenWaiting.current.has(item.id) && !dismissed.current.has(item.id)) {
            seenWaiting.current.add(item.id)
            setModalItem(item)
            notifyWaiting(item)
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
              Notification.requestPermission().then((perm) => {
                if (perm === 'granted') notifyWaiting(item)
              }).catch(() => {})
            }
            break
          }
        }
      }
      for (const id of [...seenWaiting.current]) {
        if (!nextIds.has(id)) seenWaiting.current.delete(id)
      }
      return data
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setAccessError(e.message || 'Stylist inbox access required')
        setWaiting([])
        setMine([])
        return null
      }
      console.error('[HILO] stylist inbox poll failed:', e)
      return null
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      primed.current = false
      seenWaiting.current = new Set()
      return undefined
    }
    let cancelled = false
    aiStaffApi.me().then((profile) => {
      if (!cancelled) setMe(profile)
    }).catch(() => {})
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [enabled, refresh])

  const dismissModal = useCallback(() => {
    if (modalItem?.id) dismissed.current.add(modalItem.id)
    setModalItem(null)
  }, [modalItem])

  const accept = useCallback(async (sessionId) => {
    setAcceptingId(sessionId)
    try {
      const data = await aiStaffApi.accept(sessionId)
      setModalItem((cur) => (cur?.id === sessionId ? null : cur))
      dismissed.current.add(sessionId)
      toast(true, 'Conversation claimed')
      await refresh()
      return data
    } catch (e) {
      const msg = e?.message || 'Could not accept'
      toast(false, e?.status === 409 ? 'Already taken' : msg)
      await refresh()
      throw e
    } finally {
      setAcceptingId(null)
    }
  }, [refresh])

  return {
    waiting,
    mine,
    me,
    accessError,
    modalItem,
    dismissModal,
    accept,
    acceptingId,
    refresh,
    badge: waiting.length,
  }
}
