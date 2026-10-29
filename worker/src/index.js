// Receives booking form posts from virtsutynn.ee and forwards them to Telegram.

const MAX_LENGTHS = {
  name: 100,
  email: 200,
  phone: 50,
  dates: 100,
  location: 200,
  message: 2000,
};
const MULTILINE_FIELDS = ["message"];
const MAX_BODY_BYTES = 16 * 1024;
const REQUIRED_FIELDS = ["name", "email", "dates"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABELS = {
  name: "Nimi",
  email: "E-post",
  phone: "Telefon",
  dates: "Kuupäevad",
  location: "Asukoht",
};

export function validateBooking(formData) {
  const booking = Object.fromEntries(
    Object.keys(MAX_LENGTHS).map((field) => {
      const value = String(formData.get(field) ?? "");
      // Single-line fields can't inject fake lines into the Telegram message.
      const cleaned = MULTILINE_FIELDS.includes(field) ? value : value.replace(/\s+/g, " ");
      return [field, cleaned.trim()];
    })
  );

  const missing = REQUIRED_FIELDS.find((field) => booking[field] === "");
  if (missing) return { ok: false, error: `Missing field: ${missing}` };

  const tooLong = Object.keys(MAX_LENGTHS).find((field) => booking[field].length > MAX_LENGTHS[field]);
  if (tooLong) return { ok: false, error: `Field too long: ${tooLong}` };

  if (!EMAIL_PATTERN.test(booking.email)) return { ok: false, error: "Invalid email" };

  return { ok: true, booking };
}

export function formatMessage(booking) {
  const lines = Object.entries(LABELS)
    .filter(([field]) => booking[field])
    .map(([field, label]) => `${label}: ${booking[field]}`);
  const extra = booking.message ? ["", "Lisainfo:", booking.message] : [];
  return ["🛁 Uus broneeringusoov", "", ...lines, ...extra].join("\n");
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

function json(status, error, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify({ success: error === null, error }), { status, headers });
}

async function sendTelegram(env, text) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error("Telegram sendMessage request failed", err.message);
    return false;
  }
  if (!res.ok) {
    console.error("Telegram sendMessage failed", res.status, await res.text());
  }
  return res.ok;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Accept, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    if (request.method !== "POST") return json(405, "Method not allowed", origin);
    if (!origin) return json(403, "Origin not allowed", null);

    if (env.BOOKING_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const { success } = await env.BOOKING_LIMITER.limit({ key: ip });
      if (!success) return json(429, "Too many requests", origin);
    }

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return json(413, "Request too large", origin);

    let formData;
    try {
      const contentType = request.headers.get("Content-Type") ?? "";
      formData = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      return json(400, "Invalid form data", origin);
    }

    // Honeypot: bots fill the hidden field; pretend success so they move on.
    if (String(formData.get("_gotcha") ?? "") !== "") return json(200, null, origin);

    const result = validateBooking(formData);
    if (!result.ok) return json(400, result.error, origin);

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret is not set");
      return json(500, "Server not configured", origin);
    }

    const sent = await sendTelegram(env, formatMessage(result.booking));
    return sent ? json(200, null, origin) : json(502, "Notification failed", origin);
  },
};
