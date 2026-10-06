# QUADRANT - сайт ванильного Minecraft-сервера (GitHub Pages + Firebase)

Сайт полностью статический: страницы лежат в `public/`, а аккаунты, профили, сообщения, заказы и админка
работают через **Firebase Authentication + Cloud Firestore** прямо из браузера. Сервер на Node не нужен.

## 1. Firebase (≈5 минут, бесплатно)
1. console.firebase.google.com → **Добавить проект** (Google Analytics можно выключить).
2. **Build → Authentication → Начать → Sign-in method → Email/Password → Включить**.
3. **Build → Firestore Database → Создать базу** → регион `eur3` (Европа) → режим **Production**.
4. Firestore → вкладка **Правила** → вставьте весь файл `firestore.rules` → **Опубликовать**.
5. Настройки проекта (шестерёнка) → **Ваши приложения → Web `</>`** → зарегистрируйте приложение →
   скопируйте значения `firebaseConfig` в `public/assets/firebase-config.js`.
6. Authentication → **Settings → Authorized domains → Add domain** → `ВАШ-НИК.github.io`.

## 2. GitHub Pages
1. Создайте репозиторий и залейте в него **содержимое** папки `quadrant` (вместе со скрытой папкой `.github`).
2. Репозиторий → **Settings → Pages → Source: GitHub Actions**.
3. Каждый push в ветку `main` автоматически публикует папку `public` (файл `.github/workflows/pages.yml`).
4. Адрес сайта: `https://ВАШ-НИК.github.io/РЕПОЗИТОРИЙ/` (вкладка Actions покажет ссылку).

## 3. Первый вход администратора
Зарегистрируйтесь с ником **ccotan** и почтой **ccotanno@gmail.com** - аккаунт сразу станет админом,
и в шапке появится «Админ-панель». Чтобы сменить владельца, поменяйте ник/почту в `firebase-config.js` (`owners`)
и email в `firestore.rules` (функция `ownerEmail`).

## Настройки (`public/assets/firebase-config.js` → `SITE_SETTINGS`)
| Поле | Что делает |
|---|---|
| `serverIp` | IP, который видят игроки |
| `mcHost` | адрес для статуса онлайна (через публичный api.mcsrvstat.us) |
| `discordInvite` | ссылка-приглашение в Discord |
| `discordClientId`, `discordGuildId` | привязка Discord. В discord.com/developers → OAuth2 → Redirects добавьте адрес сайта, например `https://ник.github.io/репо/` |
| `siteUrl` | точный адрес сайта для Discord-редиректа (если нужен) |
| `mapUrl`, `mapEngine` | веб-карта BlueMap / squaremap |

## Структура базы (Firestore)
| Коллекция | Что хранит | Кто видит |
|---|---|---|
| `users/{uid}` | ник, роль, статус, био, обложка, баланс | все (без email) |
| `private/{uid}` | email, заметка админа | сам игрок и админы |
| `nicks/{ник}` | связь ника с аккаунтом для входа по нику | только по точному нику |
| `covers/{uid}` | загруженное фото обложки | все |
| `config/state`, `config/products` | объявление и товары магазина | все, менять - админы |
| `orders/{id}` | заказы | покупатель и админы |
| `chats/{пара}/msgs`, `inbox/{uid}/convs` | личные сообщения | только участники |
| `log` | журнал действий | админы |

Пароли хранит Firebase Authentication (их никто не видит, даже админ).

## Что работает иначе, чем с Node-сервером
На статическом хостинге нет своего сервера, поэтому:
- **RCON, кик и авто-вайтлист** недоступны. «Одобрить» в админке ставит отметку на сайте, а `whitelist add ник` нужно выполнить в консоли Minecraft-сервера.
- **Сброс пароля** админом отправляет игроку письмо со ссылкой для сброса (новый пароль не генерируется).
- **Смена email** подтверждается письмом на новую почту.
- **«Выйти со всех устройств»** выходит только на текущем устройстве.
- **Игровая статистика** (время в игре и т.п.) не показывается - для неё нужен доступ к файлам сервера.
- **Оплата** не подключена: заказ создаётся со статусом «Ждёт оплаты», статусы меняются в админке.

## Локальный просмотр
Любой статический сервер из папки `public`, например `npx serve public` или `python3 -m http.server -d public 8080`.
Добавьте `localhost` в Authorized domains Firebase (обычно он уже там).

Старый Node-бэкенд (`server.js`, `lib/`, `api/`, `vercel.json`) оставлен для истории и сайтом на GitHub Pages не используется.
