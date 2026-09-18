# 16 — WhatsApp admin handover (Vite)

Staff replies to **WhatsApp shoppers** from a **separate** inbox from the Flutter app stylist chat.

Full admin-frontend handover (features, polling, settings, orders, optimisation): **[17 — Admin panel developer guide](./17-ADMIN-PANEL-WHATSAPP-FEATURES.md)**.

| Surface | Base | Sessions |
|---------|------|----------|
| App / Flutter handover | `/api/v1/ai/staff/*` | `channel = app` only |
| WhatsApp handover | `/api/v1/wa/staff/*` | `channel = whatsapp` only |

Do **not** mix the two. A session id from one list 404s on the other. App Accept never sends WhatsApp messages. WhatsApp Accept/send fans out to Cloud API only.

Auth is the **same** as app staff: `Authorization: Bearer` Supabase Auth access token (`handleStaffAuth`). Envelope `{ success, message, data }`.

Shopper WhatsApp webhook stays at `GET|POST /api/v1/webhooks/whatsapp` ([15](./15-WHATSAPP-STYLIST.md)). Stylists never use personal WhatsApp.

---

## How to use the admin panel (Hilo-admin-2026)

1. Sign in to the Hilo dashboard with a user who has **WhatsApp Support** (`whatsapp-inbox`) — founders/admins, or `stylist_inbox` / stylist role.
2. Allow **browser notifications** when asked.
3. You do **not** need to sit on the WhatsApp tab. A red badge and a **Waiting on WhatsApp** dialog appear on any page when a shopper asks for a real admin. Accept or Join now.
4. Open **WhatsApp Support** (also under Mobile App). Requests are at the top.
5. Right-hand **WhatsApp AI control**: pause assistant, set message style, enable orders, then fill shipping and send COD or a payment link.

SQL: re-run [`sql/ai_whatsapp.sql`](../sql/ai_whatsapp.sql) for the new `ai_config.whatsapp_*` columns.

---

Duplicate the existing **Stylist inbox** tab (layout from [14/05](./14-stylist-admin-handover/05-admin-ui.md)). New route e.g. `/stylist-whatsapp`. Do not add `?channel=` to `/ai/staff/inbox`.

```text
┌─────────────────────────────────────────────────────────────────┐
│  Hilo  →  WhatsApp inbox                             badge (N)  │
├────────────────┬────────────────────────────┬───────────────────┤
│ WAITING        │  Thread (WA transcript)    │  Shopper + phone  │
│ HISTORY        │  AI / shopper / stylist    │  Catalogue rail   │
│ MINE           │  product photos as cards   │  /wa/staff/suggest│
│                │  [ composer ]              │  /wa/staff/upload │
│                │  [ Send → /wa/.../messages]│                   │
└─────────────────────────────────────────────────────────────────┘
```

Poll **`GET /api/v1/wa/staff/sessions`** (or `inbox.items`) every **3–5s from anywhere in the dashboard**, not only while this tab is open. **User requests** (`listKind: "request"`, `status: waiting_stylist`) are always first. New request ids → **Accept modal on every admin page** + browser notification. First Accept wins (`409`). Accept / Join now jumps to this tab.

You have **20 seconds** to accept before the shopper is told a human is unavailable and AI resumes. Keep the Hilo admin tab open (any page is enough).

---

Admin can open **any** chat (AI or another admin) and **take over** immediately.

While a thread is open, poll **`GET /api/v1/wa/staff/sessions/:id`** every **2–3s**.

---

## Timeouts (WhatsApp)

| Timer | When | Shopper copy |
|-------|------|----------------|
| **20s** | Requested a human; nobody **Accept**ed | *Unable to connect with a real admin…* + Continue with AI / Try admin again. Status back to `open`; AI continues. |
| **2 min** | After a human joined, **neither** shopper nor admin sent a message | *No reply for two minutes, so I'm continuing as the Hilo assistant.* Status `open`; next shopper line is answered by AI. Admin can `takeover` again anytime. |

Flutter `/ai/staff` still uses stylist copy; these strings are WhatsApp-only.

The bot is **support + stylist**: catalogue/styling plus orders, delivery, app help. It does not invent tracking numbers.

---

## API list (`/api/v1/wa/staff`)

Auth: same staff Bearer as `/ai/staff`.

### List all chats (GET)

`GET /wa/staff/sessions?limit=200`

`data.items` — **all** WhatsApp threads, max 200.

Sort: **requests first** (oldest waiting first), then human (`with_stylist`), then AI (`open`), then closed.

`GET /wa/staff/inbox` — `{ waiting, mine, items }`. Use `items` as the same full list; `waiting` is the request queue for the badge/modal.

Row:

```json
{
  "id": "uuid",
  "channel": "whatsapp",
  "listKind": "request",
  "shopperName": "Ananya",
  "phone": "918606094557",
  "reason": "user_request",
  "summary": "…",
  "waitingSeconds": 12,
  "status": "waiting_stylist",
  "assignedStylistId": null,
  "assignedStylistName": null,
  "updatedAt": "2026-09-17T12:00:00.000Z"
}
```

`listKind`: `request` | `human` | `ai`

### Interfere / join (POST)

| Method | Path | When |
|--------|------|------|
| POST | `/wa/staff/sessions/:id/takeover` | **Preferred.** Join any chat now (`open`, waiting, or another admin). Shopper gets admin-joined copy. Status `with_stylist`. |
| POST | `/wa/staff/sessions/:id/accept` | Claim a **waiting** request only (`409` if taken). |
| POST | `/wa/staff/sessions/:id/handoff` | Put an AI thread into the **request** queue (20s wait) without joining yet. |
| POST | `/wa/staff/sessions/:id/messages` | Reply. If you are not assigned, the API **takeover**s first, then sends to WhatsApp. |

Takeover / Accept **200**: `{ sessionId, status: "with_stylist", stylistName, handoffStage: "joined" }`

### Thread + tools

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/wa/staff/me` | `{ name, stylistInbox: true }` |
| GET | `/wa/staff/sessions/:id` | Transcript + `designMemory` (any WhatsApp thread; any admin) |
| POST | `/wa/staff/suggest` | `{ query, limit? }` catalogue |
| POST | `/wa/staff/upload` | Multipart images |

### Control panel (GET + PATCH)

`GET|PATCH /wa/staff/settings`

```json
{
  "enabled": true,
  "style": "warm",
  "styleNotes": "",
  "ordersEnabled": false,
  "cloudConfigured": true,
  "paymentLink": { "available": false, "provider": "NONE", "reason": "Set CASHFREE_…" }
}
```

`style`: `warm` | `brief` | `formal`. `enabled: false` pauses the **assistant**; staff can still reply. `ordersEnabled` unlocks place-order.

### Place order + payment link

`POST /wa/staff/sessions/:id/orders`

Requires `ordersEnabled`. Body:

```json
{
  "paymentType": "COD",
  "items": [{ "productId": "uuid", "variantId": "uuid", "quantity": 1 }],
  "shipping": { "name": "", "phone": "", "line1": "", "city": "", "state": "", "pincode": "682001" }
}
```

`ONLINE` sends a Cashfree payment link on WhatsApp when `CASHFREE_APP_ID` + `CASHFREE_SECRET_KEY` are set. Otherwise `409` with why it is disabled. Missing address/items → `400`.

---

**Errors:** `401` staff token, `404` missing or app-channel id, `409` Accept race.

---

## Do not call these for WhatsApp

| Wrong | Why |
|-------|-----|
| `/ai/staff/inbox` | App sessions only |
| `/ai/staff/sessions/:id/accept` | Will not claim a WhatsApp row |
| `/ai/staff/sessions/:id/messages` | Will not send to the phone |
| `POST /ai/sessions/:id/handoff` | Shopper Flutter token, not staff |
| Direct Supabase writes | Same rule as app inbox |

App tab keeps polling `/ai/staff/inbox` only.

---

## UI flow

1. **List** — `GET /wa/staff/sessions` (`items`, requests on top). Badge = count of `listKind === "request"`.
2. **Request modal** — Accept → `POST .../accept`. Or **Join now** on any row → `POST .../takeover`.
3. **Composer** — `POST .../messages` (auto-takeover). Upload / suggest unchanged.
4. Product photos still title + price + PDP (max 5).

Copy on the phone is API-owned. Do not invent a second shopper-facing banner.

---

## Isolation checklist

- [ ] Two tabs, two poll URLs
- [ ] No shared selected-session id across tabs
- [ ] Badge counts from the matching inbox only
- [ ] Realtime (optional): filter `channel=eq.whatsapp` on the WA tab and `channel=eq.app` on the app tab — never one channel for both
- [ ] Writes only through `/wa/staff` on the WA tab

## SQL

[`sql/ai_whatsapp.sql`](../sql/ai_whatsapp.sql) after stylist + handoff SQL. Sessions already have `channel`.
