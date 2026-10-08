# Приёмка перехода на общий web UI / Capacitor

Дата: 8 октября 2026. Область: локальная реализация, browser и Android QA; подготовка iOS и CI/CD. Production не разворачивался, DNS не менялся, производственные аккаунты/матчи не создавались. Исторические web v2 данные не импортируются. Kotlin Client сохранён.

## Матрица задания

| Критерий | Результат | Доказательства и границы |
|---|---|---|
| K01 / A01 — общий source/UI | PASS | `src/` содержит renderer, стили, графику и display-модули. `scripts/build.mjs` не читает historical dist. `check:release` проверяет build metadata и SHA client.js. Browser screenshots и gameplay snapshots реально сняты; исходный UI и управление сохранены. Native/web версии assets зафиксированы в release manifest. |
| K02 / A02 — browser auth | PASS | Server browser-auth integration + browser `recovery.mjs`: opaque HttpOnly/Secure/SameSite Strict cookie, Origin/CSRF, отсутствие Bearer в JSON/DOM storage, cookies-only новый context, несколько аккаунтов, switch/logout/recovery/revoke/expiry/delete. Account header предотвращает stale command после switch. Register/recover/attach атомарны при account limit. Native Bearer regression PASS. |
| K03 / A03 — native migration | PASS локального update-install; итоговые подробности в native report | Реальный Kotlin SecureStore в отдельном synthetic package, совпадающая подпись, versionCode1→2 install-r. Все аккаунты/active/баланс/inventory/journal сохранены, переключение и cold launch проверены. Старый пользовательский QA package не очищался. Дополнительные key/IV/reset edge cases и точные команды — native-transition.md. |
| K04 / A04–A05 — надёжность | PASS локально | Unit/API tests: string BIGINT, атомарные delta/gap snapshot, duplicate taps, generation/account races, journal flush до POST и до retry, 401/409/429 Retry-After/5xx, повреждение/отказ storage, clock rollback. Native poll single-flight peak=1 при30 pause/resume. Browser offline/reconnect не повторяет move. Независимый root PG lost-after-COMMIT test подтверждает одну покупку/списание после restart/reconcile. |
| K05 / A06 — функции | PASS в заявленном browser/API объёме | Пять browser suites + API matrix, таблица ниже. Реальные UI действия главного игрока; peers через API, synthetic inventory/endgame fixtures только в локальной БД. Не заявляется естественная полная игра каждого режима без fixtures, каждый эффект на физическом устройстве или iOS. |
| K06 / A07 — Android release | PASS локальной optimized QA; внешние gates открыты | R8/non-debuggable QA local + prod-target APK, package/version/cert/manifest/assets/SHA-256 в release-manifest.json. Optimized native smoke и migration в API36/WebView. Production-target APK не создавал production аккаунтов. Реальный телефон и API26 с WebView103+ — UNVERIFIED; имеющийся API26 образ не имеет WebView. Owner store signing key не предоставлен, QA не выдаётся за подписанный store release. |
| K07 / A08 — iOS | SOURCE READY; BUILD/DEVICE UNVERIFIED | Capacitor iOS project, зарегистрированный Keychain plugin, lifecycle/config и macOS CI job. Xcode/WKWebView отсутствуют на Windows: требуется macOS build и device acceptance. Открытый Preferences вместо Keychain не используется. |
| K08 / A09 — CI/CD | LOCAL CHECKS PASS; HOSTED CI UNVERIFIED | npm ci/build/unit/API/browser tests, Server regression, Android optimized builds и smoke выполнены локально; YAML проверен парсером. CI jobs web/Android/macOS подготовлены, в GitHub в этой работе не запускались. Hosting/Caddy/env/migration/grants/staged rollout/rollback описаны; никакого auto deployment. Full npm audit0 после scoped xcode.uuid11.1.1 override, parse/generateUuid/write smoke PASS. |
| K09 — артефакты/ограничения | PASS с перечисленными внешними gates | README, browser auth contract, API/UI matrix, deployment/rollback, native report и release manifest. Секреты/keystores/fixture credentials не добавлены в tracked source; synthetic fixture находится в ignored artifacts. Старые пользовательские изменения сохранены. |

## Функциональная приёмка UI и серверного состояния

| Сценарий | Статус | Воспроизведение / evidence |
|---|---|---|
| Главная, инвентарь, магазин, рынок, задания, улучшения | PASS UI | `tests/browser.mjs`; `artifacts/browser-*.png` |
| Play/tutorial: server hint, king, bot board | PASS UI + DB | `tests/gameplay.mjs`; `transition/gameplay/tutorial.png` |
| Human duel и комната | PASS UI + DB | Gameplay: king/move главного игрока, peer API command, событие на поле; room victory screenshot |
| Team2×2 с четырьмя людьми | PASS UI + DB | `tests/integration.mjs`: все четыре короля, ход владельца UI, ход другого игрока и event update |
| Trial | PASS UI/API | Gameplay start/king/move/label; API controlled trial result проверяет rank progress и trialRun |
| Local, малое и большое поле | PASS UI + DB | Browser local10×14; gameplay local28×20/560 cells, оба короля и ход |
| Восемь направлений | PASS UI + DB | Gameplay нажимает каждую direction кнопку0–7 для point, проверяет persisted dir |
| Teleport, erase, angry | PASS UI + DB | Browser: source null, destination arrow, выбранное направление; gameplay erase без потери хода, angry даёт два действия |
| Победа, результат, история, награды, задания | PASS UI + DB | Controlled room endgame завершается настоящим выстрелом после peer response; +1200XP/+300c, одна история, clean/blocks quest counters. Скриншоты victory/history/quests |
| Кейсы buy/open | PASS UI + DB | Integration: debit, owned count, server lastCaseDrop; API same-key open выдаёт один drop |
| Скины purchase/equip/default | PASS UI + DB | `tests/cosmetics.mjs`: ownedSkins и skins после кнопок |
| Аватары purchase/equip, рамки | PASS UI + DB | Cosmetics: paid bundle, eagle selection, frame1 persisted; API locked frame rejection |
| Улучшение и max | PASS UI + DB | Cosmetics: один уровень, затем максимум по текущему балансу; API проверяет точную цену/уровни |
| Рынок filter/sort/pagination, buy | PASS UI + DB | Integration buy списывает425c; cosmetics70лотов, load more/sort; API60+1 без дублей |
| Продажа со скином, отмена | PASS UI + DB | Cosmetics: neon sale4.25+108.00, skin снимается, cancellation возвращаетskin; API buy переноситskin покупателю |
| Жалоба, block/unblock | PASS UI + DB | Cosmetics реальные формы + SQL rows; API blocked seller скрыт, direct buy и room join403, unblock возвращает доступ |
| Удаление, logout, recovery, privacy/support | PASS UI/HTTP | Recovery suite; bundled privacy открывается без готового домена; server public deletion использует толькоcookie |
| Нативные Back, фон/возврат, cold launch | PASS локального Android / внешние ограничения | Back закрывает modal, game вызывает подтверждениеleave, home вызывает minimizeApp; native report + прежний проверенный прототип; финальный device/lifecycle smoke в native evidence. |

## Повторение

Из корня репозитория, PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgres://symbols_test@127.0.0.1:5457/postgres'
npm.cmd --prefix Server test
npm.cmd --prefix Server run build
npm.cmd --prefix WebClient ci
npm.cmd --prefix WebClient test
npm.cmd --prefix WebClient run build
npm.cmd --prefix WebClient run check:release
npm.cmd --prefix WebClient run test:e2e
npm.cmd --prefix WebClient audit
```

26 WebClient tests (включая DB matrix), 34 Server tests, пять E2E suites. Без TEST_DATABASE_URL часть DB tests пропускается, такой запуск не заменяет приёмку. E2E требует локальный PostgreSQL с CREATE DATABASE, сам создаёт/удаляет отдельную БД, по умолчанию API8083/web8793. Для независимого запуска задать SYMBOLS_E2E_API_PORT и SYMBOLS_E2E_WEB_PORT. Список тестов можно ограничить SYMBOLS_E2E_TESTS; итоговый e2e.json честно перечисляет выполненные suites.

Root дополнительные доказательства: `artifacts/transition-root/client-races.test.mjs`, `browser-security.test.mjs`, `committed-response.test.mjs`, `storage-ui.mjs` и соответствующие logs. Это независимые тесты приёмки, не часть production приложения. Финальный root verdict дополняет данную матрицу после собственной проверки APK.

## Внешние условия перед rollout

1. Настроить DNS/HTTPS/same-origin hosting и WEB_ORIGIN, выполнить reviewed server migration/grants и staged rollout из deployment.md. Сверить contentVersion серверного /ready и web build.json. Это не выполнялось на production.
2. Пройти физический Android smoke и Android26 на системе с поддерживаемым WebView. Отсутствие WebView в текущем API26 эмуляторе нельзя заменить декларацией minSdk26.
3. На macOS выполнить cap sync ios и xcodebuild из native report/CI; затем iPhone/WKWebView/Keychain/recovery/lifecycle. До этого iOS не принят.
4. Предоставить owner signing key и проверить store signing/release AAB, если требуется публикация. Выданный QA подписан прежним QA сертификатом, а не ключом владельца магазина.
5. Запустить подготовленный GitHub workflow, проверить environment secrets/права и staged acceptance. CI disposable QA key не совместим с локально выданным QA certificate.

Возврат на Kotlin: сохранённый source позволяет собрать rescue APK с большим versionCode и подходящей подписью/миграцией. Android downgrade install-r и uninstall с потерей хранилища не являются допустимым rollback.
## Окончательные артефакты

В Git сохранены [манифест QA](../release/qa-artifact-manifest.json) и
[независимый локальный вердикт](../release/local-independent-review.json).
Ссылки `artifacts/` ниже относятся к локальным доказательствам; APK, screenshots,
сырые логи и приватные синтетические fixtures в репозиторий не включаются.

См. `../artifacts/transition/release-manifest.json` и отчёты `.apk.json`. Итоговая browser production сборка и packaged production APK имеют одинаковый `client.js` SHA / assetVersion `ca92f14255a9d1727a7604ac2e29aac6cacffb4f95a61852c3d9a7623cbe7bb7`. Local QA отличается только окружением API и соответствующим assetVersion `da071b31152704c793f9533ad84f4a4ae9c5f0f87dd636ce982253a062c302f2`.

| Артефакт | SHA-256 | Назначение |
|---|---|---|
| symbols-web-prod-qa-1.1.0.apk | d2859b82fc91977f1dcef422211d448b6167a17170669c4fce4396589a56e491 | production HTTPS API, com.votarumshee.symbols.qa, versionCode2, прежний QA сертификат |
| symbols-web-local-qa-1.1.0.apk | 729fc3d723bfb7617af573dc4cf8708ddbce3d56689329aa89a6526fc92065a9 | локальный emulator API10.0.2.2:8080, отдельный com.votarumshee.symbols.dev.qa |

Оба APK R8/non-debuggable/allowBackup=false, без remote server.url и WebView debugging. В APK нет native libraries; 16KB zip alignment PASS. Сертификат SHA-256 `5a45093829a45a385855f8e53ae806b56f13a30c62db661c1292ef780fc457f0` совпадает с выданным Kotlin QA. Owner/store release ключ не подменялся.

Последние исправления отдельно повторно проверены: собственный logout/delete останавливает longpoll до команды; запоздалый401 не прерывает очистку/перезапуск после успешной операции. Реальный recovery/logout/delete E2E PASS, regression для обоих terminal видов PASS. Полный WebClient набор —26/26 без skip. Исходники после упаковки финальных APK не изменялись.

Просмотр реальных экранов: `../artifacts/transition/index.html`. Native детали: `native-transition.md`; машинный отчёт: `../artifacts/transition/native-acceptance.json`.

## Независимая проверка основным агентом

Итог: локальный переход Android/browser принят в указанном объёме; внешние условия выше остаются открытыми. Основной агент отдельно выполнил 34 серверных теста, итоговые 26 тестов WebClient и 13 собственных проверок (39/39, без пропусков), все пять browser E2E suites и повтор recovery/logout/delete на окончательном production bundle. Проверка запрета localStorage показала экран восстановления без необработанных ошибок.

Подпись, package/versionCode, manifest, API origin, SHA ресурсов, отсутствие тестовых файлов и 16KB ZIP alignment итогового APK проверены независимо. После force-stop финальный migrated APK восстановил MigrationTwo и баланс 346,67; проверено по снимку экрана, поскольку UIAutomator видит только контейнер WebView. Back на главной сворачивает приложение. Полный вердикт и ссылки на логи: `../artifacts/transition-root/review.json`; снимок: `../artifacts/transition-root/migration-relaunch.png`.

Production APK — QA-артефакт, а не свидетельство выполненного production rollout. Для полной работы необходимо выкатить подготовленный backend, в том числе новый GET moderation, и выполнить остальные шаги deployment.md.
