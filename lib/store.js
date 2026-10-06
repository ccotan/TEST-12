// Хранилище данных: Upstash Redis (Vercel) или JSON-файл (локально / VPS).
const fs = require("fs"), path = require("path");

function redisStore(url, token) {
  const cmd = async (...c) => {
    const r = await fetch(url.replace(/\/$/, ""), { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(c) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error("Redis: " + (j.error || r.status));
    return j.result;
  };
  const P = v => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
  return {
    kind: "redis",
    get: async k => P(await cmd("GET", k)),
    set: (k, v, ttl) => ttl ? cmd("SET", k, JSON.stringify(v), "EX", String(Math.ceil(ttl))) : cmd("SET", k, JSON.stringify(v)),
    del: k => cmd("DEL", k),
    hget: async (h, f) => P(await cmd("HGET", h, f)),
    hset: (h, f, v) => cmd("HSET", h, f, JSON.stringify(v)),
    hdel: (h, f) => cmd("HDEL", h, f),
    hall: async h => { const a = await cmd("HGETALL", h) || [], o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = P(a[i + 1]); else for (const k in a) o[k] = P(a[k]); return o; },
    incr: (k, ttl) => cmd("INCR", k).then(async n => { if (n === 1 && ttl) await cmd("EXPIRE", k, String(ttl)); return n; }),
  };
}

// Обычный Redis по ссылке redis:// или rediss:// (например, Redis из Vercel Marketplace) - без сторонних библиотек
function respStore(link) {
  const net = require("net"), tls = require("tls"), u = new URL(link);
  let sock = null, ready = null, buf = Buffer.alloc(0), queue = [];
  const enc = a => Buffer.concat([Buffer.from(`*${a.length}\r\n`), ...a.map(x => { const b = Buffer.from(String(x)); return Buffer.concat([Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n")]); })]);
  const parse = (b, i) => { if (i >= b.length) return null; const t = b[i], e = b.indexOf("\r\n", i); if (e < 0) return null; const line = b.toString("utf8", i + 1, e);
    if (t === 43) return [line, e + 2]; if (t === 45) return [new Error(line), e + 2]; if (t === 58) return [Number(line), e + 2];
    if (t === 36) { const n = +line; if (n < 0) return [null, e + 2]; if (b.length < e + 4 + n) return null; return [b.toString("utf8", e + 2, e + 2 + n), e + 4 + n]; }
    if (t === 42) { const n = +line; if (n < 0) return [null, e + 2]; let j = e + 2; const arr = []; for (let k = 0; k < n; k++) { const r = parse(b, j); if (!r) return null; arr.push(r[0]); j = r[1]; } return [arr, j]; }
    return [null, e + 2]; };
  const fail = err => { for (const q of queue.splice(0)) q.fail(err); sock = null; ready = null; buf = Buffer.alloc(0); };
  const raw = a => new Promise((ok, no) => { queue.push({ ok, fail: no }); sock.write(enc(a)); });
  const connect = () => ready || (ready = new Promise((ok, no) => {
    const opt = { host: u.hostname, port: +u.port || 6379 }, sec = u.protocol === "rediss:";
    const s = sec ? tls.connect({ ...opt, servername: u.hostname }) : net.connect(opt);
    s.setNoDelay(true); s.setTimeout(15000, () => s.destroy(new Error("Redis timeout")));
    s.on("error", e => { fail(e); no(e); }); s.on("close", () => fail(new Error("Redis: соединение закрыто")));
    s.on("data", d => { buf = Buffer.concat([buf, d]); for (;;) { const r = parse(buf, 0); if (!r) break; buf = buf.subarray(r[1]); const q = queue.shift(); if (q) r[0] instanceof Error ? q.fail(r[0]) : q.ok(r[0]); } });
    s.once(sec ? "secureConnect" : "connect", async () => { sock = s; try { if (u.password) await raw(u.username ? ["AUTH", decodeURIComponent(u.username), decodeURIComponent(u.password)] : ["AUTH", decodeURIComponent(u.password)]); ok(); } catch (e) { s.destroy(); no(e); } });
  }));
  const cmd = async (...a) => { await connect(); return raw(a); };
  const P = v => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
  return {
    kind: "redis",
    get: async k => P(await cmd("GET", k)),
    set: (k, v, ttl) => ttl ? cmd("SET", k, JSON.stringify(v), "EX", String(Math.ceil(ttl))) : cmd("SET", k, JSON.stringify(v)),
    del: k => cmd("DEL", k),
    hget: async (h, f) => P(await cmd("HGET", h, f)),
    hset: (h, f, v) => cmd("HSET", h, f, JSON.stringify(v)),
    hdel: (h, f) => cmd("HDEL", h, f),
    hall: async h => { const a = await cmd("HGETALL", h) || [], o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = P(a[i + 1]); return o; },
    incr: (k, ttl) => cmd("INCR", k).then(async n => { if (n === 1 && ttl) await cmd("EXPIRE", k, String(ttl)); return n; }),
  };
}

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "db.json");
  let db;
  try { db = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { db = { kv: {}, h: { users: {} } }; }
  db.kv = db.kv || {}; db.h = db.h || {};
  let t = null;
  const save = () => { clearTimeout(t); if (process.env.VERCEL) flush(); else t = setTimeout(flush, 200); };
  const flush = () => { clearTimeout(t); const now = Date.now(); for (const k in db.kv) if (db.kv[k].exp && db.kv[k].exp < now) delete db.kv[k]; fs.writeFileSync(file + ".tmp", JSON.stringify(db)); fs.renameSync(file + ".tmp", file); };
  process.on("exit", () => { try { flush(); } catch {} });
  const live = k => { const e = db.kv[k]; if (!e) return null; if (e.exp && e.exp < Date.now()) { delete db.kv[k]; return null; } return e; };
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  return {
    kind: "file", flush,
    get: async k => clone(live(k)?.v),
    set: async (k, v, ttl) => { db.kv[k] = { v: clone(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }; save(); },
    del: async k => { delete db.kv[k]; save(); },
    hget: async (h, f) => clone((db.h[h] || {})[f]),
    hset: async (h, f, v) => { (db.h[h] = db.h[h] || {})[f] = clone(v); save(); },
    hdel: async (h, f) => { if (db.h[h]) delete db.h[h][f]; save(); },
    hall: async h => clone(db.h[h] || {}),
    incr: async (k, ttl) => { const e = live(k); const n = (e ? e.v : 0) + 1; db.kv[k] = { v: n, exp: e ? e.exp : ttl ? Date.now() + ttl * 1000 : 0 }; return n; },
  };
}

// Одна база: берётся первая найденная. Переменные ищутся и с префиксом (STORAGE_KV_REST_API_URL и т.п.)
function makeStore(env, dataDir) {
  const pick = (...res) => { for (const re of res) for (const k of Object.keys(env)) if (re.test(k) && env[k]) return env[k]; return ""; };
  const url = pick(/^KV_REST_API_URL$/, /^UPSTASH_REDIS_REST_URL$/, /KV_REST_API_URL$/, /REDIS_REST_(API_)?URL$/);
  const token = pick(/^KV_REST_API_TOKEN$/, /^UPSTASH_REDIS_REST_TOKEN$/, /KV_REST_API_TOKEN$/, /REDIS_REST_(API_)?TOKEN$/);
  if (url && token) return redisStore(url, token);
  const link = pick(/^REDIS_URL$/, /^KV_URL$/, /REDIS_URL$/, /KV_URL$/);
  if (/^rediss?:\/\//.test(link)) return respStore(link);
  if (env.VERCEL) { const s = fileStore("/tmp/quadrant-data"); s.kind = "temp"; return s; } // база не подключена
  return fileStore(dataDir);
}
module.exports = { makeStore };
