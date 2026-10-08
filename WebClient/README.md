# Общий web-клиент «Символов»

Основной UI находится в `src/`: общая web-версия и упакованные Capacitor Android/iOS используют один renderer. Сборка не зависит от исторического `dist/`. Kotlin `Client/` сохранён как исходная база для возврата; production в этой работе не переключался.

APIv3/PostgreSQL остаётся авторитетным источником игрового состояния. Browser использует `/api/web/v3` на том же origin, постоянную HttpOnly/Secure/SameSite=Strict cookie и серверный список аккаунтов. Bearer не возвращается JavaScript. Native использует Bearer API и AndroidKeyStore/iOSKeychain. Команды имеют сохранённый до отправки journal, BIGINT сохраняются строками; потерянные ходы не проигрываются повторно. Native longpoll строго single-flight даже после многократного background/resume.

Подробные доказательства и внешние gates: [docs/transition-acceptance.md](docs/transition-acceptance.md). Контракт: [docs/browser-auth.md](docs/browser-auth.md). Сценарии: [docs/functional-api-matrix.md](docs/functional-api-matrix.md). Выпуск/rollback: [docs/deployment.md](docs/deployment.md).

## Локальная проверка

Node24; локальный PostgreSQL17 с разрешением CREATE DATABASE. Из корня:

```powershell
npm.cmd --prefix Server ci --ignore-scripts
npm.cmd --prefix WebClient ci
$env:TEST_DATABASE_URL='postgres://symbols_test@127.0.0.1:5457/postgres'
npm.cmd --prefix Server test
npm.cmd --prefix WebClient test
npm.cmd --prefix WebClient run build
npm.cmd --prefix WebClient run check:release
npm.cmd --prefix WebClient run test:e2e
```

Последняя команда создаёт изолированную базу, поднимает API8083/web8793, выполняет5 browser suites и удаляет только свою базу. Порты настраиваются SYMBOLS_E2E_API_PORT/SYMBOLS_E2E_WEB_PORT; CHROME_PATH задаёт локальный Chrome. НаLinux сначала `npx playwright install --with-deps chromium` в WebClient. НаWindows поумолчанию используется установленный Chrome.

Для ручного web-пуска: миграции/seed Server, WEB_ORIGIN=http://127.0.0.1:8790, API8080; `npm --prefix WebClient run dev` проксирует этотAPI. В браузере открой8790. Если API/порт другой, задай SYMBOLS_LOCAL_API и SYMBOLS_WEB_PORT и соответствующий WEB_ORIGIN сервера.

## Android и iOS

QA package `com.votarumshee.symbols.qa`, versionCode2, подпись совпадает с предыдущей выданной QAверсией. Тест миграции выполнен в отдельном synthetic package из реального Kotlin SecureStore; пользовательское установленное приложение не очищалось. Local QA и prod-target QA имеют разные APIorigin; см. release manifest и native acceptance. LocalAPIhttp разрешён только в local/migrationflavors. Prodcleartext/debug/server.url запрещены guardпроверкой.

Владелец store signing key не предоставлен: QA APK не выдаётся за подписанный store release. iOS проект/Keychain/CI подготовлены; Xcode/WKWebView наWindows **UNVERIFIED**. Физический Android и Android26сактуальнымWebView остаются внешними gates.

CI `.github/workflows/web-client.yml` собирает/тестируетweb, optimizedAndroid и macOSiOS. Он создаёт артефакты и не разворачиваетproduction. Его запуск вGitHub ещё не подтверждён. `npm audit`:0; scoped xcode.uuid override11.1.1 проверен parse/UUIDv4/write тестом.
