# Web → Android UI parity, 2026-10-07

Основной игровой интерфейс восстановлен и проверен касаниями. Полное pixel-identical соответствие не заявляется; остатки перечислены ниже.

Эталон: файлы `dist/next.mjs`, `next.css`, `style.css`, `upgrade.css`, `icons.mjs`, `skin-icons.mjs` соответствуют commit `8c953993d57a887112a75c4b0a69bb2a376ea1eb` (сравнение нормализованного содержимого). Checkout `.reference` сам находится на другом HEAD.

## Стенд и сцены

Оригинальный Worker и SQLite: `127.0.0.1:8787`; Server v3: `127.0.0.1:8080`; отдельный PostgreSQL17: `127.0.0.1:5457`, `symbols_ui_test`. Production/VDS не изменялись. Аккаунты Parity26/Parity36 и OwnedParity синтетические. Базовые сцены сняты с пустым инвентарём; owned-сцены имеют по 5 специальных символов, по 2 кейса, 2000 рубинов, XP20000, рамку1 и neon sword. История/XP после сыгранных партий различаются.

Финальный web viewport411×660 CSSpx. Android36:1080×1920,420dpi, системные отступы63+126px, контент около411×660dp. HTML только визуально обрезает системные полосы; исходные PNG сохранены. Первые web кадры были393×760; они не служат доказательством одинаковой вместимости. Узкий Android:840×1860 при420dpi (~320dp), размер восстановлен после сценария; web narrow320×660. Font scale1.3 проверен отдельно, затем восстановлен.

Отчёт: `Client/artifacts/ui-parity/index.html`. PNG/XML-derived JSON: там же. Before сохранён в `Client/artifacts/screenshots/`; не все исторические сцены снимались. Отсутствующий before не означает провал финального сценария.

| Элемент / действие | Было → сделано | Проверка / остаток |
|---|---|---|
| Home | Зелёный список → градиент, rank/level/avatar/wallet, наклонённые hero tiles, основные и вторичные кнопки | Реальные web/home и Android/home; независимый review |
| Поле10×14 | Slider и формы → компактный header/status, всё поле, player panels и shelf | UI26/36, независимые касания на26 |
| King / обычный ход | Общая форма → king по клетке сразу; symbol→cell→3×3 либо immediate | Обе стороны local, directed/undirected и cancel PASS |
| Teleport | Формы → source→destination→direction | PASS: revision до выбора не меняется; после команды +1, source пуст, destination arrow dir1 |
| Повторный жест / pan | Защита busy/revision плюс350ms, callback актуального состояния | Pan SQL revision unchanged; независимый drag не отправляет ход; double-tap PASS: один Monkey injector,80ms между Tap; фактическая инъекция132/119ms, setup0→1 и move2→3. Два отдельных adb input не давали гарантированного интервала и не использованы как доказательство |
| Размер / zoom | Компактный toggle + H/V pan |10×14 и28×20, края/панель/узкий экран/font1.3 просмотрены; pinch не добавлялся |
| Направление | Стандартный узкий dialog → 94%ширины, gradient, close× и3×3 | Реальный direction, cancel, повторный выбор |
| Инвентарь / предмет | Длинные Card →3колонки, SVG, количество, rarity strip, item modal | Base/owned/item screenshots; king исключён |
| Shop / case | Списки →2колонки тематических кейсов, оригинальные SVG previews, modal | Свежие shop/case screenshots, родительский review |
| Market | Большие filters → компактная строка, count-card, groups/offers | Loaded empty раньше и synthetic offer сейчас; count только загруженной страницы при pagination — API v3 не даёт web totals |
| Upgrades | Одноколоночная форма →2колонки | Inline кнопки улучшить/максимум, без дополнительного modal/confirmation; actual command+SQL level assertion |
| Profile / rules / quests | Новый центрированный profile modal, исходные SVG в rules, более компактная иерархия | Реальные свежие screenshots; типографика/пропорции не pixel-identical |
| Skins / avatars / frames | Списки → carousel/2- и3колоночные picker, owned/selected/locked | Свежие кадры; перенесены CSS-палитры/стопы металлических градиентов и наклонные полоски; сложные violetdiamond conic/shine остаются native приближением; отдельные экраны вместо части web modal |
| Сеть / lifecycle | Success banner скрыт; реальные ошибки/offline остаются | Background/force-stop26/36 PASS; offline→Live и фактический ход revision+1 PASS36. Первая попытка ждала8s и не восстановилась; повтор с bounded wait до~60s прошёл |
| Эффекты / health | SVG projectile, beams/impacts, HP королей, CSS цвета/glow | Сборка и игровые сцены; OPEN: нет синхронного покадрового сравнения всех эффектов |
| Ожидание / результат / team | Сохранены очереди/результат/аватары, home послеdone, controls скрыты | Ordinary play2 и team4 PASS: владелец Android касаниями, peers через настоящий локальный API; все seats походили, чужой tap игнорируется, результаты получены. Парные waiting/result сняты; result центрированная gradient карточка с победителями и наградами |
| Первый вход / recovery | Компактная панель ника, новый аккаунт/recovery без legacy-import | Локальная регистрация26/36; FLAG_SECURE сохранён, screenshot защищённого ввода не используется |

## Проверки

- `:app:assembleDevQa`, `:app:assembleProdQa`, `:app:lintDevDebug` PASS. Последняя сборка: `final-acceptance-build.log`, `final-delivery-build.log`.
- `:core:test --rerun-tasks`:9 ProtocolTest +1 ServerIntegrationTest PASS с реальным localhost API.3 opt-in suites skipped: Import/Recovery/Traffic. Это не доказательство UI.
- Android26/36 R8 devQa: касания king2, arrow direction, smile immediate, cancel, pan/zoom, background, force-stop, leave/result/home PASS. Parent отдельно повторил основной сценарий26.
- Android36 advanced: owned item/teleport/source-target SQL assertions/network actual post-recovery command PASS. Secondary/large/font1.3/cosmetics/narrow snapshots PASS navigation.
- `SmokeTest.kt` адаптирован к касаниям поля и направлению; instrumentation APK собран. Сам обновлённый instrumentation runner не запускался; не отмечен PASS.
- `node --check Client/scripts/ui-parity-*.mjs` PASS. Whitespace проверяется с `git -c core.whitespace=cr-at-eol diff --check`, Windows CRLF.

## Воспроизведение

Все команды из корня репозитория. Scripts намеренно обращаются только к локальным стендам и dev.qa; `ui-parity-smoke.mjs` очищает только synthetic dev.qa на указанном эмуляторе. Перед прогоном убедиться, что API8080 и PostgreSQL5457 запущены с тестовой БД; production URL в этих сценариях отсутствует.

1. `node Client/scripts/ui-parity-web-host.mjs` запускает оригинальный Worker+SQLite8787. Playwright установлен отдельно: `npm install --prefix Client/artifacts/ui-parity playwright` (используется локальный Chrome).
2. `node Client/scripts/ui-parity-web-capture.mjs`, затем `node Client/scripts/ui-parity-web-secondary.mjs` — web base/owned сцены.
3. `node Client/scripts/ui-parity-smoke.mjs emulator-5554`, затем отдельно5556. Никогда не запускать два UI сценария на одном serial одновременно.
4. `node Client/scripts/ui-parity-advanced.mjs emulator-5556` — локальный fixture/teleport/network assertions. `ui-parity-market-fixture.mjs` добавляет реальное синтетическое предложение.
5. `node Client/scripts/ui-parity-screens.mjs emulator-5556`, затем `ui-parity-supplement.mjs emulator-5556` — secondary/large/font/narrow.
6. `python Client/scripts/ui-parity-report.py` — HTML.

ADB: `Client/.tools/sdk/platform-tools/adb.exe`; serials5554(API26),5556(API36); package `com.votarumshee.symbols.dev.qa`, activity `com.votarumshee.symbols.MainActivity`. Стенд оставлен активным для независимой проверки, cleanup ещё не выполнялся.

JDK21: `Client/.tools/jdk21/jdk-21.0.12.1+1`; JAVA_TOOL_OPTIONS `-Djdk.net.unixdomain.tmpdir=C:/repos/EVS/symbols/Client/.tools/tmp`. ProdQa собирается с ANDROID_USER_HOME=`Client/.tools/android-user` (тот же5A QA ключ), devQa — с обычным user home. APK не запускается на production ради синтетических аккаунтов.

## Артефакт

`Client/artifacts/delivery/symbols-prod-qa-web-ui-20261007.apk`; SHA256 `2bb674d53fca17a9c297cbe2d271e00cb2bca47d6244248b3e613fdd9a943abb`. Package `com.votarumshee.symbols.qa`,1.0.0/code1,min26,target36,R8,debuggable=false; endpoint `https://symbols-api.votarumshee.com`. Cert SHA256 `5a45093829a45a385855f8e53ae806b56f13a30c62db661c1292ef780fc457f0`, v2 signature и zipalign16K PASS. Предыдущий APK сохранён, его SHA78fdf7...9a4d не изменился.

UI проверялся в devQa на локальном API. ProdQa только собран и статически проверен; новая production HTTPS UI приёмка не заявляется. Обычные платформенные отличия: Android Roboto/NotoEmoji против web SegoeUI/Windows emoji, системные status/navigation bars и native scroll. Перечисленные OPEN не маскируются этими отличиями.


### Дополнительная приёмка после независимого review

`ui-parity-doubletap.mjs` / `root-doubletap-result.json`: независимый PASS26. `ui-parity-multiplayer.mjs` / `multiplayer-ui.json`: PASS36 для ordinary play и team. Android-владелец seat0 проходит реальные UI start/setup/move/leave/result; остальные2/4 участника используют настоящий API, без mocks; проверены ходы0/1 и0/1/2/3, обе стороны поля и запрет чужого tap. Это не четыре одновременно управляемых UI-девайса. Исправлен найденный неправильный hint при чужом setup. Старые попытки smoke падали из-за hidden shelf, завершившейся по таймауту игры в cleanup и неверного web selector; эти попытки не объявлены PASS.

`ui-parity-web-multiplayer.mjs` снимает оригинальный web waiting/result на двух отдельных browser contexts. `ui-parity-result.mjs` повторяет только затронутый result→home после визуальной правки; `ui-parity-final-controls.mjs` проверяет прямое inline улучшение через SQL и снимает frames. Основная матрица gesture не перепроверялась без нужды после изменения только result.
