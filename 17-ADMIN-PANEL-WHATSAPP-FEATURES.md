# 17 — Admin panel developer guide (WhatsApp Support + AI control)

This is the **handover for the Vite admin** (`Hilo-admin-2026`). It covers every **new** WhatsApp staff feature on Customer API, how the UI must call it, and how to keep the inbox fast and reliable.

Related: [15 — shopper webhook](./15-WHATSAPP-STYLIST.md) · [16 — compact `/wa/staff` contract](./16-WHATSAPP-ADMIN.md) · [14 — Flutter stylist inbox](./14-stylist-admin-handover/README.md).

**Do not write `ai_chat_*` from the dashboard.** All writes go through HTTP staff routes. The shopper never uses these APIs.

---

## 1. System in one picture

```text
Shopper WhatsApp  →  Meta Cloud API  →  POST /api/v1/webhooks/whatsapp
                                           │
                                           ├─ AI (if enabled, session open)
                                           └─ persist transcript (channel = whatsapp)

Admin Vite  →  Bearer Supabase Auth JWT  →  /api/v1/wa/staff/*
                                           │
                                           ├─ inbox / sessions / accept / takeover / messages
                                           ├─ settings (pause AI, style, enable orders)
                                           └─ place order + send COD or payment link on WhatsApp

App / Flutter stylist  →  /api/v1/ai/staff/*   (channel = app only)
```

| Tab in dashboard | Hash / tab id | API prefix | Sessions |
|------------------|---------------|------------|----------|
| Stylist inbox | `stylist-inbox` | `/api/v1/ai/staff` | `channel = app` |
| WhatsApp Support | `whatsapp-inbox` | `/api/v1/wa/staff` | `channel = whatsapp` |

Same session UUID on the wrong prefix → **404**. App Accept never messages a phone. WhatsApp send always goes through Cloud API.

Dev API: `https://backenddev.hilodesign.co/api/v1`. Envelope: `{ success, message, data }`.

---

## 2. Auth (smooth, no extra login)

Staff token = **Supabase Auth access token** from `supabase.auth.getSession()`.

```http
Authorization: Bearer <access_token>
Accept: application/json
```

Allowed if `team_members.stylist_inbox` is true, **or** role is admin / founder / Super Admin / `super_admin` / stylist, **or** email `hilo.dev.admin@gmail.com`.

| Status | Meaning |
|--------|---------|
| 401 | Missing/expired JWT — refresh session, do not treat as empty inbox |
| 403 | User has no inbox permission — show “WhatsApp inbox access required”, stop polling |
| 404 | Wrong channel or unknown id |
| 409 | Accept race (`Already taken`) or payment link not configured |
| 503 | SQL missing (`ai_whatsapp.sql` / handoff columns) |

On 401/403: clear lists, **do not** toast every 4s. One banner is enough.

Grant the tab in `getUserTabs` / role presets: `whatsapp-inbox`. Founders already get `ALL_TABS`.

---

## 3. New features (what to build / what already shipped)

### 3.1 Global handoff alert (must work off-tab)

Shopper: “talk to a real admin” → session `waiting_stylist` for **20 seconds**.

**Required UX**

- Poll WhatsApp inbox **while the admin is logged in**, on **every** page (Dashboard, POS, …), not only hash `whatsapp-inbox`.
- New `waiting_stylist` id → **modal on top of the current page** (shopper name, phone, summary, reason, waiting time).
- Buttons: **Later** · **Join now** (`takeover`) · **Accept** (`accept`).
- After success: `navigateTo('whatsapp-inbox')` and focus that `sessionId`.
- Red badge on **WhatsApp Support** = count of `listKind === "request"`.
- Optional: `Notification` API (`tag: wa-waiting-<id>`). Request permission once after login.

**Do not**

- Gate the modal with `page === 'whatsapp-inbox'` (that hid every request).
- Mark waiting ids as “seen” while `notify` is false (then opening the tab never shows the dialog).
- Rely on the shopper waiting longer than 20s. If nobody accepts, status returns to `open` and AI continues.

Reference implementation: `src/pages/whatsapp/useWhatsAppInbox.js` + `AcceptHandoffModal` always mounted in `App.jsx`.

### 3.2 Full WhatsApp inbox

Four queues from one list (`GET /wa/staff/sessions` or `inbox.items`):

| Section | Filter |
|---------|--------|
| Requests | `listKind === "request"` or `status === "waiting_stylist"` |
| With admin | `listKind === "human"` or `status === "with_stylist"` |
| AI chats | `status === "open"` |
| Closed | `status === "closed"` |

Any admin may **open any thread**. **Join now** / sending a message **takeover**s. Composer hint: replies go to WhatsApp.

Open thread: poll `GET /wa/staff/sessions/:id` every **2–3s**. Roles: `user` | `assistant` | `stylist`. Metadata may include `products`, `imageUrls`, `kind` (`handoff_connecting` | `handoff_joined`), `orderNumber`.

### 3.3 WhatsApp AI control panel (right rail)

`GET` then `PATCH /wa/staff/settings`.

| Field | Effect |
|-------|--------|
| `enabled` | `false` pauses the **assistant**. Shopper is told an admin will reply. Staff send still works. |
| `style` | `warm` \| `brief` \| `formal` — extra voice on the next AI turn |
| `styleNotes` | Free text, max 800 chars (atelier, language, never mention X) |
| `ordersEnabled` | Unlocks place-order. Default **false**. |
| `cloudConfigured` | Read-only: env token + phone id present |
| `paymentLink.available` | Read-only: Cashfree keys on API |

Save only on **Save settings**. Do not PATCH on every keystroke.

Env `WHATSAPP_ENABLED=false` on the server still kills Cloud API entirely; the dashboard toggle cannot override that.

### 3.4 Place order from the inbox

`POST /wa/staff/sessions/:id/orders` after `ordersEnabled`.

1. Attach 1–5 catalogue cards (`POST /wa/staff/suggest`).
2. Shipping: **name, phone, line1, city, state, 6-digit pincode** (line2 optional). Prefill name/phone from the session.
3. `paymentType`: `COD` or `ONLINE`.
4. If `variantId` is missing, API uses the product’s first variant.
5. Success: order is stored, a stylist message is inserted, **the same text is sent on WhatsApp**.

`ONLINE` without Cashfree keys → **409** with `paymentLink.reason`. Show that string; do not invent a URL.

COD works without Cashfree.

### 3.5 Catalogue + images (unchanged contract, WhatsApp rendering)

- `POST /wa/staff/suggest` `{ query, limit? }` → `{ items }` (title, price, image, id).
- `POST /wa/staff/upload` multipart `file` + optional `directory`.
- `POST /wa/staff/sessions/:id/messages` `{ content?, imageUrls?, productIds? }` (at least one). Max 5 products. Phone gets image + caption (title, price, PDP), not app “Use as base / Try on”.

---

## 4. API cheat sheet

Base path below is `/api/v1/wa/staff`. All staff Bearer.

| Method | Path | When |
|--------|------|------|
| GET | `/me` | Once per login — `{ name, stylistInbox }` |
| GET | `/inbox` | `{ waiting, mine, items }` — badge + modal from `waiting` / `items` |
| GET | `/sessions?limit=200` | Full list (preferred for the four queues) |
| GET | `/sessions/:id` | Transcript + `session` + `designMemory` |
| POST | `/sessions/:id/accept` | Claim **waiting** only |
| POST | `/sessions/:id/takeover` | Join any WhatsApp chat now |
| POST | `/sessions/:id/handoff` | Put an AI thread on the 20s request queue |
| POST | `/sessions/:id/messages` | Reply (auto-takeover) |
| POST | `/suggest` | Catalogue search |
| POST | `/upload` | Images |
| GET | `/settings` | Control panel |
| PATCH | `/settings` | `{ enabled?, style?, styleNotes?, ordersEnabled? }` |
| POST | `/sessions/:id/orders` | Place order + WhatsApp copy |

List row (`data.items[]`):

```json
{
  "id": "uuid",
  "channel": "whatsapp",
  "listKind": "request",
  "shopperName": "Ananya",
  "phone": "918606094557",
  "reason": "user_request",
  "summary": "short handoff blurb",
  "waitingSeconds": 12,
  "status": "waiting_stylist",
  "assignedStylistId": null,
  "assignedStylistName": null,
  "updatedAt": "2026-09-18T12:00:00.000Z"
}
```

Settings `data`:

```json
{
  "enabled": true,
  "style": "warm",
  "styleNotes": "",
  "ordersEnabled": false,
  "cloudConfigured": true,
  "paymentLink": {
    "available": false,
    "provider": "NONE",
    "reason": "Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY…"
  }
}
```

Order body:

```json
{
  "paymentType": "COD",
  "items": [{ "productId": "uuid", "variantId": "uuid", "quantity": 1 }],
  "shipping": {
    "name": "Ananya",
    "phone": "918606094557",
    "line1": "12 MG Road",
    "city": "Kochi",
    "state": "Kerala",
    "pincode": "682001"
  }
}
```

201 `data`: `{ sessionId, order, paymentUrl, paymentLive, paymentNote, sentToWhatsapp }`.

Health (no auth): `GET /api/v1/health` → `data.ai.whatsapp` (Cloud configured), `data.ai.whatsappAi` (assistant not paused).

---

## 5. Timeouts (do not re-implement on the client)

| Clock | Server behaviour | UI |
|-------|------------------|----|
| **20s** waiting, no Accept | Shopper: unable to connect + Continue AI / Try admin. Status `open`. | Drop from Requests. Do not keep a fake waiting row. |
| **2 min** silence after join | Shopper: AI resumed. Status `open`. | Thread moves to AI chats. Admin can Join now again. |

Shopper-facing sentences are **API-owned**. Do not add a second banner in the dashboard for the phone.

---

## 6. Optimisation (keep the dashboard smooth)

**Poll less, poll the right thing**

- **Global** (logged-in + has `whatsapp-inbox`): `GET /wa/staff/inbox` **or** `GET /wa/staff/sessions?limit=200` every **4s**. One timer for the whole app, not per tab.
- **Open thread**: `GET /wa/staff/sessions/:id` every **2–3s** only while that pane is visible. Stop on unmount / tab hide (`document.visibilityState === 'hidden'` → pause both timers).
- Do **not** poll `/sessions/:id` for every row in the list.
- Do **not** call `/me` on every tick — once per session is enough.
- Settings: GET when the control panel mounts; PATCH on Save only.

**Deduplicate work**

- If you already call `/sessions`, you do not also need `/inbox` unless you want `waiting`/`mine` split without filtering. Prefer **one** list endpoint.
- `useWhatsAppInbox({ enabled, notify: true })` at **App** level; tabs only receive props. Avoid two hooks both polling.
- Abort in-flight fetch on unmount (`AbortController`) so a slow request cannot overwrite a newer list.

**List rendering**

- Key rows by `id`. Cap display (API already max 200).
- Badge = `requests.length`, not a second network call.
- Modal: one waiting id at a time; `tag` notifications so the same request does not stack.

**Thread pane**

- Replace the message array from the poll; do not append blindly (duplicates).
- If `updatedAt` / last message id unchanged, skip `setState`.
- Images: use URLs from metadata; do not re-upload.

**Sends**

- Disable the send button until 201. On failure, keep the draft.
- `409` on Accept: toast “Already taken”, refresh list, do not navigate.
- Takeover + send in one click is OK (`messages` auto-takeover). Do not fire accept then takeover then send.

**Realtime (optional later)**

- Supabase `postgres_changes` on `ai_chat_sessions` with `channel=eq.whatsapp` **only** on the WA feature. App inbox uses `channel=eq.app`.
- Writes still go through `/wa/staff`. Realtime is notify-only.
- Replication must be on (`ai_chat_sessions`, `ai_chat_messages`). See [14/06](./14-stylist-admin-handover/06-realtime-notify.md).

**Bundle size / mount**

- Keep-alive mount (`mountedTabs`) so returning to the tab is instant, but **do not** mount WhatsApp inbox until first visit **or** first Accept (then `navigateTo` adds the tab). The **poller** must still run globally.

---

## 7. Smooth-working checklist

**Login**

1. Wait for `team_members` + `getUserTabs` before starting WA polls (`enabled` false until then).
2. Request notification permission once.

**Handoff**

3. Modal is a sibling of the main layout (high `z-index`), not inside the WhatsApp tab.
4. Accept / Join → focus id + open WhatsApp Support.
5. Later dismisses **that** id only; a new request can still modal.

**Isolation**

6. Separate selected-session state from Stylist inbox.
7. Sidebar: `waBadge` vs `inboxBadge`.
8. Never call `/ai/staff/*` from the WhatsApp tab.

**Control + orders**

9. Payment link button disabled when `!paymentLink.available`; show `reason`.
10. Place order disabled until `ordersEnabled` **and** shipping valid **and** ≥1 attached product.
11. After order 201, clear attached products; thread poll will show the stylist line.

**SQL / deploy**

12. Re-run [`sql/ai_whatsapp.sql`](../sql/ai_whatsapp.sql) so `ai_config.whatsapp_*` exists. PATCH settings without it → 503.
13. Customer API and admin must point at the **same** Supabase project as `SUPABASE_URL` on the API.

**Ops**

14. Keep at least one dashboard tab open during shop hours (20s window).
15. If health `whatsapp: false`, Cloud env is missing — control panel cannot fix that.
16. If health `whatsappAi: false` but `whatsapp: true`, someone paused the assistant in settings.

---

## 8. Client helper (copy into admin)

```js
async function waStaff(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${API_URL}/wa/staff${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) {
    const err = new Error(json?.message || res.statusText)
    err.status = res.status
    throw err
  }
  return json.data
}
```

Shipped in admin as `waStaffApi` in `src/lib/aiStaffApi.js` (`createStaffApi('/wa/staff')`).

---

## 9. What this is not

- Not Meta WhatsApp Manager (DP, about, billing) — browser Business Suite.
- Not personal WhatsApp / WhatsApp Business app on the Cloud API number.
- Not Flutter `/ai/staff`.
- Not a second product catalogue — `suggest` uses the live Hilo catalogue only.

---

## 10. Files to touch in `Hilo-admin-2026`

| File | Role |
|------|------|
| `src/lib/aiStaffApi.js` | `waStaffApi` + `getSettings` / `patchSettings` / `placeOrder` |
| `src/pages/whatsapp/useWhatsAppInbox.js` | Global poll, badge, modal, Accept/Join |
| `src/pages/whatsapp/WhatsAppInboxTab.jsx` | Queues, thread, catalogue |
| `src/pages/whatsapp/WaControlPanel.jsx` | Pause AI, style, orders |
| `src/pages/App.jsx` | `notify: true`, modal always mounted, `waBadge` |
| `src/components/Sidebar.jsx` | WhatsApp Support + request badge |
| `src/lib/constants.js` | tab id `whatsapp-inbox` |

API source of truth in this repo: `src/modules/ai/staff.router.ts` (`createStaffRouter("whatsapp")`).
