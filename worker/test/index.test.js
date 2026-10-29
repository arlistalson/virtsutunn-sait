import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { validateBooking, formatMessage } from "../src/index.js";

const ORIGIN = "https://virtsutynn.ee";
const ENV = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_ID: "42",
  ALLOWED_ORIGINS: "https://virtsutynn.ee,https://www.virtsutynn.ee",
};

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const VALID = {
  name: "Mari Maasikas",
  email: "mari@example.ee",
  phone: "+372 5555 5555",
  dates: "25.–27. juuli",
  location: "Tartu",
  message: "Kas puud on hinna sees?",
};

function post(fields, origin = ORIGIN) {
  return new Request("https://booking.example.workers.dev/", {
    method: "POST",
    headers: origin ? { Origin: origin } : {},
    body: form(fields),
  });
}

let realFetch;
let telegramCalls;
let telegramStatus;

beforeEach(() => {
  realFetch = globalThis.fetch;
  telegramCalls = [];
  telegramStatus = 200;
  globalThis.fetch = async (url, init) => {
    telegramCalls.push({ url, body: JSON.parse(init.body) });
    return new Response("{}", { status: telegramStatus });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("validateBooking accepts a complete booking and trims values", () => {
  const result = validateBooking(form({ ...VALID, name: "  Mari  " }));
  assert.equal(result.ok, true);
  assert.equal(result.booking.name, "Mari");
});

test("validateBooking rejects missing required fields", () => {
  const result = validateBooking(form({ ...VALID, dates: "  " }));
  assert.equal(result.ok, false);
  assert.match(result.error, /dates/);
});

test("validateBooking rejects an invalid email", () => {
  const result = validateBooking(form({ ...VALID, email: "not-an-email" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /email/);
});

test("validateBooking rejects over-long fields", () => {
  const result = validateBooking(form({ ...VALID, message: "x".repeat(2001) }));
  assert.equal(result.ok, false);
  assert.match(result.error, /message/);
});

test("validateBooking collapses line breaks in single-line fields but keeps them in message", () => {
  const result = validateBooking(form({ ...VALID, name: "Mari\nE-post: fake@x.ee", message: "rida 1\nrida 2" }));
  assert.equal(result.booking.name, "Mari E-post: fake@x.ee");
  assert.equal(result.booking.message, "rida 1\nrida 2");
});

test("formatMessage lists filled fields and skips empty optional ones", () => {
  const text = formatMessage({ ...VALID, phone: "", location: "" });
  assert.match(text, /Mari Maasikas/);
  assert.match(text, /mari@example\.ee/);
  assert.match(text, /Kas puud on hinna sees\?/);
  assert.doesNotMatch(text, /Telefon/);
  assert.doesNotMatch(text, /Asukoht/);
});

test("valid POST sends one Telegram message and returns success", async () => {
  const res = await worker.fetch(post(VALID), ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, error: null });
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].url, "https://api.telegram.org/bot123:abc/sendMessage");
  assert.equal(telegramCalls[0].body.chat_id, "42");
  assert.match(telegramCalls[0].body.text, /Mari Maasikas/);
});

test("filled honeypot pretends success without notifying", async () => {
  const res = await worker.fetch(post({ ...VALID, _gotcha: "bot" }), ENV);
  assert.equal(res.status, 200);
  assert.equal(telegramCalls.length, 0);
});

test("invalid booking returns 400 without notifying", async () => {
  const res = await worker.fetch(post({ ...VALID, email: "" }), ENV);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).success, false);
  assert.equal(telegramCalls.length, 0);
});

test("disallowed origin returns 403", async () => {
  const res = await worker.fetch(post(VALID, "https://evil.example"), ENV);
  assert.equal(res.status, 403);
  assert.equal(telegramCalls.length, 0);
});

test("non-POST methods return 405", async () => {
  const res = await worker.fetch(new Request("https://x.dev/", { headers: { Origin: ORIGIN } }), ENV);
  assert.equal(res.status, 405);
});

test("OPTIONS preflight from allowed origin returns 204 with CORS headers", async () => {
  const req = new Request("https://x.dev/", { method: "OPTIONS", headers: { Origin: ORIGIN } });
  const res = await worker.fetch(req, ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("rate-limited requests return 429 without notifying", async () => {
  const env = { ...ENV, BOOKING_LIMITER: { limit: async () => ({ success: false }) } };
  const res = await worker.fetch(post(VALID), env);
  assert.equal(res.status, 429);
  assert.equal(telegramCalls.length, 0);
});

test("Telegram failure returns 502 so the visitor sees the fallback", async () => {
  telegramStatus = 401;
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(post(VALID), ENV);
    assert.equal(res.status, 502);
  } finally {
    console.error = originalError;
  }
});

test("oversized body returns 413 without notifying", async () => {
  const res = await worker.fetch(post({ ...VALID, message: "x".repeat(20000) }), ENV);
  assert.equal(res.status, 413);
  assert.equal(telegramCalls.length, 0);
});

test("network error reaching Telegram returns 502 with CORS headers", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(post(VALID), ENV);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  } finally {
    console.error = originalError;
  }
});

test("missing Telegram secrets returns 500 without calling Telegram", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(post(VALID), { ...ENV, TELEGRAM_BOT_TOKEN: "" });
    assert.equal(res.status, 500);
    assert.equal(telegramCalls.length, 0);
  } finally {
    console.error = originalError;
  }
});
