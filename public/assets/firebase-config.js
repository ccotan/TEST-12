/* ===== НАСТРОЙКИ САЙТА - заполните один раз =====
   1) Firebase Console → Настройки проекта (шестерёнка) → «Ваши приложения» → Web (</>) → скопируйте firebaseConfig сюда.
   Эти ключи не секретные - данные защищают правила из firestore.rules. */
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

window.SITE_SETTINGS = {
  serverIp: "play.quadrant-mc.ru",        // IP, который видят игроки
  mcHost: "",                            // адрес для статуса онлайна (можно тот же IP), пусто = не показывать
  discordInvite: "https://discord.gg/HnuYyrVPmS",
  discordClientId: "",                   // ID приложения Discord (для привязки). Пусто = привязка выключена
  discordGuildId: "",                    // ID вашего Discord-сервера
  siteUrl: "",                           // необязательно: https://ник.github.io/репозиторий/
  mapUrl: "",                            // адрес BlueMap / squaremap
  mapEngine: "BlueMap",
  owners: [["ccotan", "ccotanno@gmail.com"]], // ник + email владельца → сразу админ (то же самое укажите в firestore.rules)
};
