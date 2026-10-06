/* QUADRANT - "бэкенд" прямо в браузере: Firebase Auth + Cloud Firestore.
   Перехватывает все запросы fetch("/api/...") и выполняет их через Firebase,
   поэтому сайт работает на любом статическом хостинге (GitHub Pages). */
(function () {
  const FC = window.FIREBASE_CONFIG || {}, S = window.SITE_SETTINGS || {};
  const origFetch = window.fetch.bind(window);
  const JR = (status, json) => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const ready = !!(FC.apiKey && FC.projectId && window.firebase);

  window.fetch = function (input, init) {
    const raw = typeof input === "string" ? input : input && input.url;
    let u; try { u = new URL(raw, location.href); } catch { return origFetch(input, init); }
    const i = u.pathname.indexOf("/api/");
    if (u.origin !== location.origin || i < 0) return origFetch(input, init);
    if (!ready) return Promise.resolve(JR(503, { error: "Firebase не настроен: заполните assets/firebase-config.js" }));
    const method = (init && init.method) || "GET";
    let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}
    return route(method.toUpperCase(), u.pathname.slice(i), u.searchParams, body)
      .then(([s, j]) => JR(s, j))
      .catch(e => { console.error(e); return JR(e.status || 500, { error: e.ru || ruErr(e) }); });
  };
  if (!ready) return;

  firebase.initializeApp(FC);
  const auth = firebase.auth(), db = firebase.firestore(), FV = firebase.firestore.FieldValue;
  const OWNERS = (S.owners || [["ccotan", "ccotanno@gmail.com"]]).map(([n, e]) => [n.toLowerCase(), e.toLowerCase()]);
  const authReady = new Promise(r => { const un = auth.onAuthStateChanged(x => { un(); r(x); }); });
  const E = (status, ru) => Object.assign(new Error(ru), { status, ru });
  const now = () => new Date().toISOString();
  const C = n => db.collection(n);
  const DEFAULT_PRODUCTS = [
    { id: "pass", cat: "Аккаунт", title: "Проходка", desc: "Мгновенный доступ в вайтлист без ожидания заявки.", price: 199, badge: "Хит", skin: "Steve", color: "#3E7BD9" },
    { id: "plus1", cat: "Подписки", title: "QUADRANT+ · 1 мес", desc: "Цветной ник в Discord, значок на сайте и приоритет в очереди заявок.", price: 149, skin: "jeb_", color: "#21A038" },
    { id: "plus3", cat: "Подписки", title: "QUADRANT+ · 3 мес", desc: "Всё из подписки на месяц, но на три месяца и дешевле.", price: 399, old: 447, badge: "Выгодно", skin: "Dinnerbone", color: "#0FA8E0" },
    { id: "twink", cat: "Аккаунт", title: "Твинк-аккаунт", desc: "Второй аккаунт в вайтлисте, привязанный к основному.", price: 129, old: 259, skin: "Alex", color: "#E9A23B" },
    { id: "rename", cat: "Аккаунт", title: "Смена аккаунта", desc: "Перенос прогресса и места в вайтлисте на новый ник.", price: 99, skin: "Grumm", color: "#3CC6C9" },
    { id: "warn", cat: "Ограничения", title: "Снятие варна", desc: "Снимает одно предупреждение с аккаунта.", price: 79, skin: "Notch", color: "#D9822B" },
    { id: "unban", cat: "Ограничения", title: "Разблокировка", desc: "Досрочная разблокировка. Не действует на баны за читы и гриферство.", price: 499, skin: "Steve", color: "#7A3FC2" },
    { id: "badge", cat: "Поддержка", title: "Значок сезона", desc: "Памятный значок «Сезон 1» в профиле на сайте и роль в Discord.", price: 59, skin: "Technoblade", color: "#E5578A" },
    { id: "donate", cat: "Поддержка", title: "Поддержать сервер", desc: "Помощь в оплате хостинга. Спасибо от всей команды!", price: 100, badge: "Спасибо", skin: "Herobrine", color: "#7DBE2E" },
  ];

  function ruErr(e) {
    const M = {
      "auth/email-already-in-use": "Email уже используется", "auth/invalid-email": "Некорректный email",
      "auth/weak-password": "Слишком простой пароль", "auth/wrong-password": "Неверный пароль",
      "auth/invalid-credential": "Неверный ник или пароль", "auth/invalid-login-credentials": "Неверный ник или пароль",
      "auth/user-not-found": "Неверный ник или пароль", "auth/too-many-requests": "Слишком много попыток, подождите немного",
      "auth/network-request-failed": "Нет соединения с интернетом", "auth/requires-recent-login": "Войдите заново и повторите",
      "auth/operation-not-allowed": "В Firebase не включён вход по email/паролю",
      "permission-denied": "Нет доступа (проверьте правила Firestore)", "unavailable": "База данных недоступна, попробуйте позже",
      "failed-precondition": "Нужно создать индекс в Firestore (ссылка в консоли браузера)",
    };
    return M[e && e.code] || (e && e.message) || "Ошибка";
  }

  // ---------- данные ----------
  const isOwner = (u, email) => OWNERS.some(([n, e]) => u.nick.toLowerCase() === n && String(email || "").toLowerCase() === e);
  const plusOf = u => !!(u.plusUntil && new Date(u.plusUntil) > new Date());
  const statusOf = u => u.banned ? "banned" : !(u.discord && u.discord.inGuild) ? "need_discord" : u.whitelisted ? "approved" : u.rejected ? "rejected" : "pending";
  const pub = (u, email) => ({ nick: u.nick, email: email || "", created: u.created, whitelisted: !!u.whitelisted, rejected: !!u.rejected, banned: !!u.banned, banReason: u.banReason || "", bio: u.bio || "", cover: u.cover || 0, skinBg: u.skinBg || 0, coverImg: u.coverImg || "", plus: plusOf(u), plusUntil: u.plusUntil || null, role: u.role || "player", balance: Math.max(0, Math.round(+u.balance || 0)), discord: u.discord ? { username: u.discord.username || "", inGuild: !!u.discord.inGuild } : null });
  const publicView = (u, full) => ({ nick: u.nick, coverV: u.coverV || "", created: u.created, role: u.role || "player", plus: plusOf(u), banned: !!u.banned, bio: u.bio || "", cover: u.cover || 0, skinBg: u.skinBg || 0, ...(full ? { coverImg: u.coverImg || "", whitelisted: !!u.whitelisted } : {}) });

  async function userByNick(nick) {
    const k = String(nick || "").trim().toLowerCase(); if (!/^[a-z0-9_]{3,16}$/.test(k)) return null;
    const n = await C("nicks").doc(k).get(); if (!n.exists) return null;
    const d = await C("users").doc(n.data().uid).get(); return d.exists ? { uid: d.id, ...d.data() } : null;
  }
  async function getCover(uid) { const d = await C("covers").doc(uid).get(); return d.exists ? d.data().img || "" : ""; }
  async function audit(who, action, target, details = "") { try { await C("log").add({ t: now(), who, action, target, details: String(details).slice(0, 300) }); } catch (e) { console.warn("log", e); } }
  async function getProducts() { const d = await C("config").doc("products").get(); return d.exists && Array.isArray(d.data().items) ? d.data().items : DEFAULT_PRODUCTS; }
  async function getAnnouncement() { const d = await C("config").doc("state").get(); return (d.exists && d.data().announcement) || { enabled: false, text: "", type: "info" }; }

  // текущий игрок
  async function me() {
    await authReady; const fu = auth.currentUser; if (!fu) return null;
    const d = await C("users").doc(fu.uid).get(); if (!d.exists) return null;
    const U = { uid: fu.uid, ...d.data() };
    if (U.banned) { await auth.signOut(); return null; }
    if (isOwner(U, fu.email) && U.role !== "admin") { U.role = "admin"; await C("users").doc(fu.uid).update({ role: "admin" }); }
    const k = U.nick.toLowerCase(), n = await C("nicks").doc(k).get();   // email мог смениться после подтверждения
    if (n.exists && fu.email && n.data().email !== fu.email) { await C("nicks").doc(k).update({ email: fu.email }); await C("private").doc(fu.uid).set({ email: fu.email }, { merge: true }); }
    return { U, fu };
  }
  async function unread(uid) { const s = await C("inbox").doc(uid).collection("convs").where("unread", ">", 0).get(); let n = 0; s.forEach(d => n += d.data().unread || 0); return n; }
  async function reauth(fu, pw) { try { await fu.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(fu.email, String(pw || ""))); } catch (e) { throw E(400, "Пароль неверный"); } }

  // ---------- статус Minecraft-сервера (публичный API mcsrvstat.us) ----------
  let stCache = { t: 0, v: null };
  async function serverStatus() {
    const host = S.mcHost || ""; if (!host) return { unknown: true };
    if (Date.now() - stCache.t < 60000 && stCache.v) return stCache.v;
    let v = { online: false };
    try { const r = await origFetch("https://api.mcsrvstat.us/3/" + encodeURIComponent(host)); const j = await r.json();
      if (j.online) v = { online: true, players: (j.players && j.players.online) || 0, max: (j.players && j.players.max) || 0, sample: ((j.players && j.players.list) || []).map(p => p.name || p).filter(n => /^[A-Za-z0-9_]{3,16}$/.test(n)) }; } catch {}
    stCache = { t: Date.now(), v }; return v;
  }

  // ---------- Discord (OAuth2 implicit flow, без сервера) ----------
  const discordOn = () => !!(S.discordClientId && S.discordGuildId);
  const siteRoot = () => S.siteUrl ? S.siteUrl.replace(/\/?$/, "/") : location.origin + location.pathname.replace(/[^/]*$/, "");
  window.QDiscordLogin = () => {
    const st = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("q_dst", st);
    location.href = "https://discord.com/oauth2/authorize?" + new URLSearchParams({ client_id: S.discordClientId, redirect_uri: siteRoot(), response_type: "token", scope: "identify guilds", state: st, prompt: "none" });
  };
  const discordDone = (async () => {
    const h = new URLSearchParams(location.hash.slice(1)); if (!h.get("access_token") && !h.get("error")) return;
    const tok = h.get("access_token"), st = h.get("state"); let res = "err";
    history.replaceState(null, "", location.pathname + location.search);
    try {
      if (!tok || st !== sessionStorage.getItem("q_dst")) throw 0;
      const m = await me(); if (!m) throw 0;
      const A = { Authorization: "Bearer " + tok };
      const du = await (await origFetch("https://discord.com/api/users/@me", { headers: A })).json(); if (!du.id) throw 0;
      const taken = await C("users").where("discord.id", "==", du.id).get();
      if (taken.docs.some(d => d.id !== m.U.uid)) res = "taken";
      else {
        const g = await (await origFetch("https://discord.com/api/users/@me/guilds", { headers: A })).json();
        const inGuild = Array.isArray(g) && g.some(x => x.id === S.discordGuildId);
        await C("users").doc(m.U.uid).update({ discord: { id: du.id, username: du.username || "", inGuild, linkedAt: now() } });
        await audit(m.U.nick, "discord_link", m.U.nick, `@${du.username} ${inGuild ? "на сервере" : "не на сервере"}`);
        res = inGuild ? "ok" : "notin";
      }
    } catch (e) { if (e) console.warn(e); }
    sessionStorage.removeItem("q_dst");
    const q = new URLSearchParams(location.search); q.set("discord", res);
    history.replaceState(null, "", location.pathname + "?" + q + location.hash);
  })();

  // ---------- маршруты ----------
  async function route(M, p, q, b) {
    await discordDone;
    if (p.startsWith("/api/admin/")) return adminApi(p.slice(11), M, b);
    if (M === "GET") {
      if (p === "/api/config") return [200, { discordEnabled: discordOn(), discordInvite: S.discordInvite || "", ip: S.serverIp || "", mapUrl: S.mapUrl || "", mapEngine: S.mapEngine || "", announcement: await getAnnouncement(), db: "firebase" }];
      if (p === "/api/health") return [200, { ok: true, db: "firebase" }];
      if (p === "/api/shop") return [200, { products: (await getProducts()).filter(x => !x.hidden) }];
      if (p === "/api/status") return [200, await serverStatus()];
      if (p === "/api/me") { const m = await me(); return [200, { user: m ? { ...pub({ ...m.U, coverImg: m.U.coverV ? await getCover(m.U.uid) : "" }, m.fu.email), unread: await unread(m.U.uid) } : null }]; }
      if (p === "/api/players") {
        const s = String(q.get("q") || "").toLowerCase().trim();
        const all = (await C("users").limit(1000).get()).docs.map(d => d.data());
        const list = all.filter(u => u.nick && !u.banned && (!s || u.nick.toLowerCase().includes(s)))
          .sort((a, b) => (b.role === "admin") - (a.role === "admin") || String(b.lastLogin || b.created).localeCompare(String(a.lastLogin || a.created)));
        return [200, { total: list.length, players: list.slice(0, 200).map(u => publicView(u)) }];
      }
      if (p === "/api/player") { const u = await userByNick(q.get("nick")); if (!u) throw E(404, "Игрок не найден"); if (u.coverV) u.coverImg = await getCover(u.uid); return [200, { player: publicView(u, true) }]; }
      if (p === "/api/cover") { const u = await userByNick(q.get("nick")); const img = u && !u.banned && u.coverV ? await getCover(u.uid) : ""; if (!img) throw E(404, "Нет баннера"); return [200, { img }]; }
    }
    if (p === "/api/register" && M === "POST") {
      const nick = String(b.nick || "").trim(), email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
      if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) throw E(400, "Некорректный ник");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw E(400, "Некорректный email");
      if (pw.length < 8 || pw.length > 200) throw E(400, "Пароль должен быть от 8 символов");
      const k = nick.toLowerCase();
      if ((await C("nicks").doc(k).get()).exists) throw E(409, "Этот ник уже зарегистрирован");
      const cred = await auth.createUserWithEmailAndPassword(email, pw), uid = cred.user.uid, t = now();
      const u = { nick, created: t, whitelisted: false, rejected: false, banned: false, discord: null, role: "player", balance: 0, lastLogin: t, bio: "", cover: 0, skinBg: 0, coverV: "" };
      if (isOwner(u, email)) u.role = "admin";
      try {
        await C("nicks").doc(k).set({ uid, email });
        const bt = db.batch(); bt.set(C("users").doc(uid), u); bt.set(C("private").doc(uid), { email, note: "" }); await bt.commit();
      } catch (e) { await cred.user.delete().catch(() => {}); throw e.code === "permission-denied" ? E(409, "Этот ник уже зарегистрирован") : e; }
      await audit(nick, "register", nick);
      return [201, { user: { ...pub(u, email), unread: 0 } }];
    }
    if (p === "/api/login" && M === "POST") {
      const login = String(b.login || "").trim().toLowerCase(); let email = login;
      if (!login.includes("@")) { const n = /^[a-z0-9_]{3,16}$/.test(login) ? await C("nicks").doc(login).get() : null; if (!n || !n.exists) throw E(401, "Неверный ник или пароль"); email = n.data().email; }
      const cred = await auth.signInWithEmailAndPassword(email, String(b.password || ""));
      const d = await C("users").doc(cred.user.uid).get();
      if (!d.exists) { await auth.signOut(); throw E(401, "Аккаунт не найден"); }
      const U = { uid: d.id, ...d.data() };
      if (U.banned) { await auth.signOut(); throw E(403, "Аккаунт заблокирован" + (U.banReason ? ": " + U.banReason : "")); }
      const upd = { lastLogin: now() }; if (isOwner(U, cred.user.email)) upd.role = U.role = "admin";
      await C("users").doc(U.uid).update(upd);
      if (U.coverV) U.coverImg = await getCover(U.uid);
      return [200, { user: { ...pub(U, cred.user.email), unread: await unread(U.uid) } }];
    }
    if (p === "/api/logout" || p === "/api/logout-all") { await auth.signOut(); return [200, { ok: true }]; }

    const m = await me(); if (!m) throw E(401, "Войдите в аккаунт");
    const { U, fu } = m, ref = C("users").doc(U.uid);
    if (M === "GET") {
      if (p === "/api/stats") return [200, { stats: null }];
      if (p === "/api/orders") { const s = await C("orders").where("uid", "==", U.uid).get(); return [200, { orders: s.docs.map(d => d.data()).sort((a, b) => String(b.created).localeCompare(String(a.created))) }]; }
      if (p === "/api/messages") {
        const s = await C("inbox").doc(U.uid).collection("convs").get();
        return [200, { convs: s.docs.map(d => { const c = d.data(); return { nick: c.nick, last: c.last || "", mine: !!c.mine, at: c.at, unread: c.unread || 0 }; }).sort((a, b) => String(b.at).localeCompare(String(a.at))) }];
      }
      if (p === "/api/messages/thread") {
        const o = await userByNick(q.get("with")); if (!o) throw E(404, "Игрок не найден");
        const pair = [U.uid, o.uid].sort().join("_");
        const s = await C("chats").doc(pair).collection("msgs").orderBy("t", "desc").limit(300).get();
        const ib = C("inbox").doc(U.uid).collection("convs").doc(o.uid), c = await ib.get();
        if (c.exists && c.data().unread) await ib.update({ unread: 0 });
        return [200, { with: publicView(o), messages: s.docs.map(d => d.data()).reverse().map(x => ({ from: x.f, text: x.x, at: x.t })) }];
      }
      throw E(404, "Not found");
    }
    if (p === "/api/profile") {
      const upd = {};
      if (b.skinBg != null) upd.skinBg = Math.max(0, Math.min(6, Math.floor(+b.skinBg) || 0));
      if (b.bio !== undefined || b.cover !== undefined) { upd.bio = String(b.bio || "").replace(/\s+/g, " ").trim().slice(0, 160); upd.cover = Math.max(0, Math.min(5, +b.cover || 0)); }
      if (typeof b.coverImg === "string") {
        if (b.coverImg && (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.coverImg) || b.coverImg.length > 5e5)) throw E(400, "Фото слишком большое или неподходящее");
        if (b.coverImg) { await C("covers").doc(U.uid).set({ img: b.coverImg }); upd.coverV = Date.now().toString(36); }
        else { await C("covers").doc(U.uid).delete().catch(() => {}); upd.coverV = ""; }
      }
      if (Object.keys(upd).length) await ref.update(upd);
      const nu = { ...U, ...upd }; nu.coverImg = nu.coverV ? (typeof b.coverImg === "string" ? b.coverImg : await getCover(U.uid)) : "";
      return [200, { user: pub(nu, fu.email) }];
    }
    if (p === "/api/password") {
      await reauth(fu, b.current).catch(() => { throw E(400, "Текущий пароль неверный"); });
      if (String(b.next || "").length < 8) throw E(400, "Новый пароль короче 8 символов");
      await fu.updatePassword(String(b.next)); await audit(U.nick, "password", U.nick); return [200, { ok: true }];
    }
    if (p === "/api/email") {
      const email = String(b.email || "").trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw E(400, "Некорректный email");
      await reauth(fu, b.password);
      await fu.verifyBeforeUpdateEmail(email);
      return [200, { user: pub(U, fu.email), notice: "Мы отправили письмо на " + email + " - перейдите по ссылке, чтобы подтвердить новый email" }];
    }
    if (p === "/api/discord/unlink") { await ref.update({ discord: null, whitelisted: false }); await audit(U.nick, "discord_unlink", U.nick); return [200, { user: pub({ ...U, discord: null, whitelisted: false }, fu.email) }]; }
    if (p === "/api/delete-account") {
      await reauth(fu, b.password); await audit(U.nick, "self_delete", U.nick);
      const bt = db.batch(); bt.delete(C("nicks").doc(U.nick.toLowerCase())); bt.delete(ref); bt.delete(C("private").doc(U.uid)); bt.delete(C("covers").doc(U.uid)); await bt.commit();
      await fu.delete(); return [200, { ok: true }];
    }
    if (p === "/api/order") {
      const pr = (await getProducts()).find(x => x.id === b.product && !x.hidden); if (!pr) throw E(404, "Товар не найден");
      const id = "Q" + Date.now().toString(36).toUpperCase() + Math.random().toString(16).slice(2, 6).toUpperCase();
      const o = { id, uid: U.uid, nick: U.nick, product: pr.id, title: pr.title, price: pr.price, method: b.method === "sbp" ? "sbp" : "card", status: "awaiting_payment", created: now() };
      await C("orders").doc(id).set(o); await audit(U.nick, "order", U.nick, `${id} · ${pr.title} · ${pr.price} ₽`);
      return [201, { order: o }];
    }
    if (p === "/api/messages/send") {
      const o = await userByNick(b.to); if (!o) throw E(404, "Игрок не найден");
      if (o.uid === U.uid) throw E(400, "Нельзя написать самому себе");
      const text = String(b.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000); if (!text) throw E(400, "Пустое сообщение");
      const t = now(), pair = [U.uid, o.uid].sort().join("_"), short = text.slice(0, 80);
      await C("chats").doc(pair).collection("msgs").add({ f: U.nick, by: U.uid, x: text, t });
      const bt = db.batch();
      bt.set(C("inbox").doc(U.uid).collection("convs").doc(o.uid), { nick: o.nick, last: short, mine: true, at: t, unread: 0 });
      bt.set(C("inbox").doc(o.uid).collection("convs").doc(U.uid), { nick: U.nick, last: short, mine: false, at: t, unread: FV.increment(1) }, { merge: true });
      await bt.commit();
      return [201, { message: { from: U.nick, text, at: t } }];
    }
    throw E(404, "Not found");
  }

  // ---------- админ-панель ----------
  async function adminApi(p, M, b) {
    const m = await me();
    if (!m || m.U.role !== "admin") throw E(401, m ? "Нет доступа: вы не администратор" : "Войдите на сайте под аккаунтом администратора");
    const who = m.U.nick;
    const allUsers = async () => (await C("users").get()).docs.map(d => ({ uid: d.id, ...d.data() }));
    const allOrders = async () => (await C("orders").orderBy("created", "desc").limit(2000).get()).docs.map(d => d.data());
    const getLog = async n => (await C("log").orderBy("t", "desc").limit(n).get()).docs.map(d => d.data());
    if (p === "me") return [200, { ok: true, who }];
    if (p === "overview") {
      const [list, orders, recent] = await Promise.all([allUsers(), allOrders(), getLog(6)]), counts = {};
      list.forEach(u => { const s = statusOf(u); counts[s] = (counts[s] || 0) + 1; });
      const revenue = orders.filter(o => o.status === "done" || o.status === "paid").reduce((a, o) => a + o.price, 0);
      const days = [...Array(14)].map((_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { d, n: list.filter(u => String(u.created).slice(0, 10) === d).length }; });
      return [200, { total: list.length, counts, days, revenue, newOrders: orders.filter(o => o.status === "awaiting_payment" || o.status === "paid").length, server: await serverStatus(), rcon: false, discord: discordOn(), autoWhitelist: false, recent }];
    }
    if (p === "users") {
      const [list, priv] = await Promise.all([allUsers(), C("private").get()]); const P = {}; priv.forEach(d => P[d.id] = d.data());
      return [200, { users: list.map(u => ({ ...pub(u, (P[u.uid] || {}).email), coverImg: undefined, status: statusOf(u), note: (P[u.uid] || {}).note || "", lastLogin: u.lastLogin || null, lastIp: "", discord: u.discord || null })).sort((a, b) => String(b.created).localeCompare(String(a.created))) }];
    }
    if (p === "log") return [200, { log: await getLog(300) }];
    if (p === "orders") return [200, { orders: await allOrders() }];
    if (p === "products" && M === "GET") return [200, { products: await getProducts() }];
    if (p === "announcement" && M === "GET") return [200, await getAnnouncement()];
    if (M !== "POST") throw E(404, "Not found");
    if (p === "announcement") {
      const a = { enabled: !!b.enabled, text: String(b.text || "").slice(0, 300), type: b.type === "warn" ? "warn" : "info" };
      await C("config").doc("state").set({ announcement: a }, { merge: true }); await audit(who, "announcement", "-", a.enabled ? a.text : "выключено"); return [200, a];
    }
    if (p === "order") {
      const r = C("orders").doc(String(b.id || "")), d = await r.get(); if (!d.exists) throw E(404, "Заказ не найден");
      if (!["awaiting_payment", "paid", "done", "cancelled"].includes(b.status)) throw E(400, "Неверный статус");
      const o = { ...d.data(), status: b.status, updated: now() };
      if (b.status === "done" && /^plus(\d)$/.test(o.product)) { const u = await userByNick(o.nick); if (u) { const base = plusOf(u) ? new Date(u.plusUntil) : new Date(); base.setMonth(base.getMonth() + +o.product.slice(4)); await C("users").doc(u.uid).update({ plusUntil: base.toISOString() }); } }
      await r.update({ status: o.status, updated: o.updated }); await audit(who, "order_status", o.nick, `${o.id} → ${b.status}`); return [200, { order: o }];
    }
    if (p === "products") {
      if (!Array.isArray(b.products)) throw E(400, "Нужен список товаров");
      const items = b.products.slice(0, 100).map(x => { const o = { id: String(x.id || Math.random().toString(16).slice(2, 8)).replace(/[^\w-]/g, "").slice(0, 32), cat: String(x.cat || "Прочее").slice(0, 40), title: String(x.title || "Товар").slice(0, 60), desc: String(x.desc || "").slice(0, 200), price: Math.max(0, Math.round(+x.price || 0)), skin: String(x.skin || "Steve").replace(/[^\w]/g, "").slice(0, 16), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : "#21A038", hidden: !!x.hidden };
        if (+x.old > 0) o.old = Math.round(+x.old); if (x.badge) o.badge = String(x.badge).slice(0, 20); return o; });
      await C("config").doc("products").set({ items }); await audit(who, "products", "-", `${items.length} товаров`); return [200, { products: items }];
    }
    if (p === "rcon") throw E(502, "RCON недоступен на GitHub Pages - выполните команду в консоли Minecraft-сервера");
    if (p === "update") {
      const u = await userByNick(b.nick); if (!u) throw E(404, "Игрок не найден");
      const pv = (await C("private").doc(u.uid).get()).data() || {}, upd = {};
      if (b.role !== undefined) upd.role = isOwner(u, pv.email) ? "admin" : ["player", "helper", "moderator", "admin"].includes(b.role) ? b.role : "player";
      if (b.balance !== undefined && b.balance !== "") upd.balance = Math.max(0, Math.min(1e9, Math.round(+b.balance || 0)));
      if (Object.keys(upd).length) await C("users").doc(u.uid).update(upd);
      if (b.note !== undefined) await C("private").doc(u.uid).set({ note: String(b.note).slice(0, 1000) }, { merge: true });
      const nu = { ...u, ...upd }; await audit(who, "update", u.nick, `роль: ${nu.role || "player"}, баланс: ${nu.balance || 0}`);
      return [200, { user: { ...pub(nu, pv.email), status: statusOf(nu), note: b.note !== undefined ? String(b.note) : pv.note || "", discord: nu.discord || null } }];
    }
    if (p === "action") {
      const errors = [];
      for (const n of (Array.isArray(b.nicks) ? b.nicks : [b.nick]).slice(0, 200)) {
        const u = await userByNick(n); if (!u) continue;
        const pv = (await C("private").doc(u.uid).get()).data() || {}, r = C("users").doc(u.uid);
        try {
          switch (b.action) {
            case "approve": await r.update({ whitelisted: true, rejected: false }); break;
            case "reject": await r.update({ whitelisted: false, rejected: true }); break;
            case "unwhitelist": await r.update({ whitelisted: false }); break;
            case "ban": if (isOwner(u, pv.email)) throw new Error("нельзя заблокировать владельца"); await r.update({ banned: true, banReason: String(b.reason || "").slice(0, 200), whitelisted: false }); break;
            case "unban": await r.update({ banned: false, banReason: "" }); break;
            case "discord_ok": await r.update({ discord: { ...(u.discord || {}), inGuild: true, manual: true } }); break;
            case "discord_reset": await r.update({ discord: null }); break;
            case "kick": throw new Error("кик работает только через консоль сервера");
            case "reset_password": if (!pv.email) throw new Error("нет email"); await auth.sendPasswordResetEmail(pv.email); await audit(who, b.action, u.nick); return [200, { ok: true, password: "Письмо для сброса пароля отправлено на " + pv.email }];
            case "delete": { if (isOwner(u, pv.email)) throw new Error("нельзя удалить владельца"); const bt = db.batch(); bt.delete(C("nicks").doc(u.nick.toLowerCase())); bt.delete(r); bt.delete(C("private").doc(u.uid)); bt.delete(C("covers").doc(u.uid)); await bt.commit(); await audit(who, "delete", u.nick); continue; }
            default: throw E(400, "Неизвестное действие");
          }
          await audit(who, b.action, u.nick, b.reason || "");
        } catch (e) { if (e.status === 400) throw e; errors.push(`${u.nick}: ${e.ru || e.message}`); }
      }
      return [errors.length ? 207 : 200, { ok: !errors.length, errors }];
    }
    throw E(404, "Not found");
  }

  // обложки игроков для списка (img[data-cover])
  window.QLoadCovers = root => (root || document).querySelectorAll("img[data-cover]").forEach(async img => {
    try { const r = await window.fetch("/api/cover?nick=" + encodeURIComponent(img.dataset.cover)); const j = await r.json(); if (j.img) img.src = j.img; else img.remove(); } catch { img.remove(); }
  });
})();
