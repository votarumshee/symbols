# Проверки Client

## Production VDS acceptance — 2026-10-07

На AOSP Android36 выполнена новая black-box приёмка `stagingQa` и точно выдаваемого `prodQa` через доверенный `https://symbols-api.votarumshee.com`. Во время всех изменяющих данные тестов Caddy направлял только IP проверяющего на отдельные app/PostgreSQL, с тем же immutable server image. Production БД не использовалась. Выполнены регистрация, каталог/инвентарь, игровой экран, доставка событий, отключение Wi-Fi/data и восстановление, Home/возврат, force-stop/восстановление матча и завершение. В prodQa после сетевого отказа наблюдался предусмотренный long-poll fallback; после foreground/restart подтверждён WSS. Начальный тест ошибочно требовал только WSS сразу после восстановления сети; исправлен тест, бинарник не менялся, повторный полный прогон PASS.

Собраны `:app:assembleStagingDebug`, `:app:assembleStagingQa`, `:app:assembleProdQa` с соответствующими URL properties. `:app:lintStagingDebug`:0errors,23warnings,5hints; R8/vital lint прошли. Повторный `:core:test --rerun-tasks` с `SYMBOLS_TEST_URL=https://symbols-api.votarumshee.com`:10passed (9 protocol + real ServerIntegrationTest),3skipped (import, opt-in local fault-proxy, traffic measurements). Это не повторная fault-proxy/нагрузочная приёмка. До интеграционного прогона подтверждён уникальный маркер временного маршрута; тесты нельзя направлять на открытый production.

APK и подпись: [manifest](../release/vds-qa-artifact.json). Локальные свидетельства: `artifacts/qa-stagingQa-emulator-5556.json`, `artifacts/qa-prodQa-emulator-5556.json`, `artifacts/screenshots/{variant}-emulator-5556-{home,inventory,match,result}.png`. Staging SHA256: `978c76337a9c214d58aa3d3001752eb8e480afa1bcc2540f297396837fdc930d`. ProdQa SHA256: `78fdf7e180b6adc442413494d43f187f2e264ed4595fb094c91c5dbe56ec9a4d`. UI-script разрешает только отдельные QA packages и для staging/prod до `pm clear` требует точный `SYMBOLS_ACCEPTANCE_MARKER`, возвращаемый изолированным Caddy. Показатели эмулятора не являются производительностью физического телефона.

Подробный итог VDS: [public API verification](../../Server/docs/vds-public-api-verification.md). Предыдущий отчёт ниже сохраняет историю разработки и отдельные ограничения магазинного выпуска.

Это отчёт о фактической проверке разработки, **не подтверждение готовности production**. Дата: 2026-10-06. Windows, JDK 21, Gradle 8.14.3, Android SDK 36. Реальный локальный Server v3 + PostgreSQL 17.11, отдельная БД `symbols_client_test`. Данные игроков не использовались.

## Выполнено

- Server: 17/17 тестов без пропусков, включая гонку двух покупателей, идемпотентность, ревизии, таймеры/ботов, режимы, импорт, блокировку и удаление. Новая проверка подтверждает серверный уровень >300, обучение и отсутствие приватных полей в эффектах. Контракты сгенерированы одним серверным генератором.
- Kotlin: точные деньги, DTO/fixtures, ревизии, дубликаты, пропуски событий, sparse board patches, ограничение повторов и безопасные URL. Реальная Ktor-интеграция проверяет восстановление, ETag 304, WebSocket, локальную партию, повтор команды, недостаточный баланс и удаление.
- Импорт: исходный Worker создал синтетический аккаунт; отдельный импорт в PostgreSQL сверил ID, ник, баланс 1234,56, инвентарь, улучшения, косметику, звание и историю. Два входа проверили сохранность прогресса. В Android проверены вход, пересоздание Activity, покупка/открытие кейса и удаление. Секретный fixture исключён из Git и выдаваемых приложений.
- Compose UI: первый запуск, инвентарь, сохранение экрана после Activity recreation, установка двух королей, завершение; второй сценарий — импорт/магазин/удаление. На AOSP Android 26 и 36 без Google Play Services.
- Два экземпляра приложения, одновременно на Android 26 и 36: комната 10×14, дуэль 28×20, 2×2 с четырьмя аккаунтами (по два на экземпляр). Все шесть device-прогонов прошли; дополнительный седьмой прогон Android прошёл обучение с серверным ботом. Проверены собственные ходы и очистка старого снимка при смене аккаунта. `scripts/android-pair.mjs` и `MultiplayerTest` воспроизводят сценарий.
- Fault proxy + настоящий Repository/Server/PostgreSQL: потеря HTTP-ответа после commit и повтор тем же ключом не меняют профиль второй раз; команда при отсутствии сети не отправляется; 429 соблюдает Retry-After, 503 сохраняет ключ; RTT 350 мс; фон закрывает WS, возврат восстанавливает; удалённая сессия получает 401. Это управляемая имитация отказов, а не тест сотового радиомодуля.
- 10-минутные замеры: [методика и ограничения](network-measurements.md).
- Lint: ошибок нет; предупреждения о новых версиях зависимостей, boxing Compose state и KTX не подавлялись.
- `devQa`: R8 + shrinkResources, `debuggable=false`, debug-сертификат. APK и AAB подготовлены. Проверены подпись, ZIP alignment и PT_LOAD всех восьми ELF-библиотек (16 384). Это статическая проверка совместимости 16 КБ; на 16-КБ ARM-устройстве запуск не выполнялся.

## Как проверяется оптимизированный APK

Compose instrumentation против minified target столкнулся с ограничением раннера: отсутствующие после R8 библиотечные классы Trace/LazyKt. Искусственные keep-rules в приложение не оставлены. Вместо этого `scripts/qa-smoke.mjs` управляет **точно выдаваемым devQa APK** через Android UI: регистрация, инвентарь, запуск локальной партии, force-stop процесса, восстановление партии и завершение. Метрики и скриншоты сохраняются в локальном `artifacts/`. Это самостоятельная black-box проверка, не тот же instrumentation-набор и не production-подпись.

## Оставшаяся приёмка и ограничения

Последний black-box devQa прогон: Android 36 — cold start `am start -W` 573 мс, PSS 31 398 КБ, 195 кадров короткой прокрутки, jank 2,56%, p95 30 мс; Android 26 — 738 мс, PSS 28 239 КБ, 237 кадров, jank 77,64%, p95 48 мс. Оба эмулятора используют software GPU. Это не время до готовности сервера и не длительный игровой benchmark. Высокий jank Android 26 нельзя считать пройденным критерием плавности; требуется профилирование физического устройства и игрового поля. Raw dumps в `measurements/qa-*.json`. ANR/крашей в этих коротких сценариях не было.

- Реального телефона нет среди подключённых устройств. Средний/бюджетный физический телефон, переключение Wi-Fi ↔ мобильная сеть, 16-КБ ARM, полноценный TalkBack и увеличенный системный шрифт требуют отдельного прогона. Emulator profiling не заменяет его.
- Нет полного автоматического визуального прогона каждой фигуры/направления/косметики и длительного испытания наград/утечек памяти. Доменное поведение движка проверяет Server; нативная отрисовка всех комбинаций ещё требует ручной приёмки по матрице.
- Рамки адаптированы нативной отрисовкой; их декоративные эффекты не являются покадровой копией CSS. Траектории используют серверные события; экономику анимации не меняют.
- Рестарт Server в активной партии с force-stop приложения проверен на Android 36. 10-минутный Android сетевой замер с control-frame bytes и измерение задержки видимого хода в двух UI ещё не выполнены.
- CI определён и должен отдельно подтвердиться на GitHub; локальный зелёный прогон не означает зелёный CI.
- Production URL, privacy/support, applicationId/versionCode и подпись владельца не подтверждены. Production APK/AAB не выдаются под видом готовых: release требует настоящий HTTPS endpoint и отдельную подпись.

Не согласованные исключения не считаются закрытыми пунктами задания. До оставшейся приёмки и внешних параметров PR остаётся draft, публикация запрещена.

## Повторение

Сначала мигрировать и заполнить тестовую PostgreSQL, запустить Server из каталога `Server/`. Для импорта подготовить эталон в `.reference/` на SHA из dependency-manifest, `npm ci --ignore-scripts && npm run build`; затем `DATABASE_URL=...symbols_client_test node Client/scripts/prepare-import-fixture.mjs`. Приватный fixture скопировать в `Client/app/src/androidTest/assets/synthetic-fixture.json`. После UI-теста он удалён сервером — для следующего прогона генерировать новый.

Запустить `node Client/scripts/fault-proxy.mjs`; для `:core:test` задать `SYMBOLS_FAULT_TEST=1`, `SYMBOLS_TEST_URL=http://127.0.0.1:8080`, `SYMBOLS_IMPORT_FIXTURE=<absolute path>`. Для UI выбрать один эмулятор через `ANDROID_SERIAL` и выполнить `:app:connectedDevDebugAndroidTest`. Парный тест opt-in: сначала `android-pair.mjs prepare`, собрать/установить debug и androidTest APK на два эмулятора, затем `android-pair.mjs run`. Credentials не выводятся; тестовый APK с assets не распространять.

Многократные прогоны упираются в реальные серверные лимиты 10 регистраций/5 восстановлений за 15 минут. На локальной синтетической БД лимиты очищались между полными прогонами; в production их ослаблять нельзя. Fault-тест отдельно проверяет настоящий клиентский ответ на 429.

## Web UI QA — 2026-10-07

См. [web-ui-parity.md](web-ui-parity.md) и `artifacts/ui-parity/index.html`. DevQa R8 реальные касания на API26/36; SQL asserts teleport и network recovery PASS36; lint и обе R8 QA сборки PASS. Core:10tests PASS,3 opt-in skipped. Updated instrumentation test compiled, not executed. ProdQa verified statically only; production untouched. Новый artifact `release/web-ui-qa-artifact.json`, прежний APK сохранён. Открытые визуальные/сценарные пункты перечислены в матрице, а не объявлены PASS.

Дополнительная приёмка UI: double-tap26 PASS (один Monkey injector,80ms; одна revision); ordinary2/team4 PASS36 с owner UI taps + real API peers; paired waiting/result, inline upgrade SQL assertion и result→home PASS. Frames получили металлические CSS-градиенты. Итоговый SHA256 web-ui APK: `2bb674d53fca17a9c297cbe2d271e00cb2bca47d6244248b3e613fdd9a943abb`. Последние сборки/lint: `final-acceptance-build.log`, `final-delivery-build.log`; подпись5A и zipalign16K PASS.
