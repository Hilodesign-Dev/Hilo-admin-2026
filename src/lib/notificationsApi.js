/**
 * Admin Panel API helpers for dispatching push notifications and managing
 * Push Notification Marketing campaigns via Hilo Customer API (/api/v1/notifications).
 */

import { supa } from "./supabase";

const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_URL || "https://backenddev.hilodesign.co/api/v1";
};

async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  try {
    const { data } = await supa.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // fallback if unauthenticated session
  }
  return headers;
}

/**
 * Send targeted push notification to a specific user (e.g. order update, try-on ready)
 */
export async function sendPushNotification({
  userId,
  category,
  title,
  body,
  imageUrl,
  route,
  data,
  priority = "high",
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiBaseUrl()}/notifications/send`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId,
      category,
      title,
      body,
      imageUrl,
      route,
      data,
      priority,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to send notification");
  }
  return json.data;
}

/**
 * Broadcast marketing alert to all customers subscribed to "offers_and_new_collections" topic
 */
export async function broadcastMarketingPush({
  title,
  body,
  imageUrl,
  route,
  data,
  topic = "offers_and_new_collections",
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${getApiBaseUrl()}/notifications/broadcast`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      body,
      imageUrl,
      route,
      data,
      topic,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to broadcast notification");
  }
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH MARKETING CAMPAIGNS API
// ─────────────────────────────────────────────────────────────────────────────

export const pushMarketingApi = {
  /**
   * Query devices for campaign targeting with location, platform, and search filters
   */
  queryDevices: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set("search", params.search);
    if (params.city) q.set("city", params.city);
    if (params.state) q.set("state", params.state);
    if (params.platform && params.platform !== "all") q.set("platform", params.platform);
    if (params.page != null) q.set("page", String(params.page));
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.onlyActive != null) q.set("onlyActive", String(params.onlyActive));

    const headers = await getAuthHeaders();
    const qs = q.toString();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/devices${qs ? `?${qs}` : ""}`, {
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to query devices");
    return json.data;
  },

  /**
   * List past campaigns with delivery metrics
   */
  listCampaigns: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.status && params.status !== "all") q.set("status", params.status);
    if (params.search) q.set("search", params.search);

    const headers = await getAuthHeaders();
    const qs = q.toString();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/campaigns${qs ? `?${qs}` : ""}`, {
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to list campaigns");
    return json.data;
  },

  /**
   * Get single campaign by ID
   */
  getCampaign: async (id) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/campaigns/${id}`, {
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to get campaign");
    return json.data;
  },

  /**
   * Create and launch (or draft) a push marketing campaign
   */
  createCampaign: async (payload) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/campaigns`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to create campaign");
    return json.data;
  },

  /**
   * Launch a draft campaign
   */
  launchCampaign: async (id) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/campaigns/${id}/launch`, {
      method: "POST",
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to launch campaign");
    return json.data;
  },

  /**
   * Send single test push to admin phone / token
   */
  sendTestPush: async (payload) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${getApiBaseUrl()}/notifications/marketing/test-send`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Failed to send test push");
    return json.data;
  },
};
