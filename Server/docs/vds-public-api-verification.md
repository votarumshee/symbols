# Public API acceptance — 7 октября 2026

**PASS.** Production `https://symbols-api.votarumshee.com` открыт через Caddy `reverse_proxy server:3000` в17:27:23МСК /14:27:23UTC. Полный изменяющий данные E2E и Android UI выполнены заранее на отдельном синтетическом экземпляре. Production smoke был только read-only/auth-negative; тестовые игроки в production не создавались.

## Зафиксированная версия и предварительная проверка

- Git HEAD `c76fcae8e802677d3db140c8fea8e29b013eb551`, ветка `codex/vds-production-setup`. Working tree содержит существующие незакоммиченные инфраструктурные файлы и новые сценарии/документы этой приёмки; commit/push не выполнялись. Серверный и клиентский application code не менялись; изменены routing и проверки.
- Release `/opt/symbols/releases/c76fcae8e802`, current symlink сохранён. Server image `sha256:b6c9209c294b02bf6fe0d5814a73f901b2a9bd74a8980f334c62d94fbc188da9` одинаков у production и тестового экземпляра.
- PostgreSQL image `sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`; Caddy image `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`.
- SSH/sudo, Compose config --quiet, healthy БД/app, readiness, UFW и все6таймеров подтверждены. Failed units0. Runtime role symbols_app не superuser/createdb/createrole и не имеет CREATE в public.
- БД не публикуется на хосте; приложение слушает127.0.0.1:3000. Caddy frontend172.30.41.3 соответствует TRUST_PROXY. Сертификат проверялся обычными доверенными HTTPS/WSS-клиентами без отключения TLS.
- До приёмки и непосредственно перед открытием: profiles0, content676, links456, migrations3. Content version `6ce99aba116be01d15816dccb4f85613ba314a8fb8c78ae1da70cb33d79f7c56`. После smoke profiles также0; появление настоящих пользователей в дальнейшем не является ошибкой.

## Изолированная публичная проверка

С17:09:59 до17:23:54МСК /14:09:59–14:23:54UTC существующий домен направлялся на тестовый app только для проверенного публичного IP46.191.227.83. Остальным Caddy возвращал maintenance503. Поддомен, DNS и сертификат не менялись. Заголовок `X-Symbols-Acceptance:6a4944508fe9` существовал только в этом маршруте; проверочные скрипты требуют точное значение до регистрации/очистки QA package.

Созданы `symbols-public-app-6a4944508fe9`, `symbols-public-db-6a4944508fe9`, internal network `symbols-public-net-6a4944508fe9`. БД `symbols_public_test`, новые credentials, runtime symbols_app; никакие production writable volumes/URL не подключались. Тестовая БД512MB/tmpfs256MB, app384MB/0.75CPU; миграции и справочники установлены тем же immutable image. Временные avatar-файлы могли находиться только в слое тестового app.

`Server/deploy/public-api-e2e.mjs`: PASS в17:13:36МСК /14:13:36UTC:

- HTTPS health/ready, регистрация, authenticated bootstrap, каталог и ETag304.
- Настоящий WSS upgrade с Authorization header; токен не передавался в URL. Локальный синтетический матч: start, размещение двух королей, play, leave/done и события. Повтор start/leave с прежним Idempotency-Key возвращает прежний результат; баланс не применяется повторно.
- Серверный heartbeat ping/pong наблюдался после20секунд. Разрыв, команда offline, replay с последнего cursor; следующее переподключение не повторяет уже применённый event.
- Long-poll `/changes` просыпается после команды. Cursor вне допустимого диапазона вызывает SNAPSHOT_REQUIRED по HTTP409 и WSS; новый bootstrap доступен. Удаление старой истории в production не выполнялось.
- Приватные HTTP/WSS отклоняют отсутствующий/неверный bearer. Logout закрывает активный WSS1008 и запрещает HTTP/reconnect.
- Шесть запросов recovery с шестью подставленными X-Forwarded-For: первые5 дают400 за намеренно неверный формат кода, шестой429. Это подтверждает общий IP-limit за доверенным proxy. Лимиты сбрасывались только в отдельной синтетической БД перед независимым Kotlin-прогоном, production limits не менялись.

Первый harness ошибочно ожидал401 вместо400 для неверного формата recovery-code; исправлено ожидание согласно accounts.mjs. Подготовительный скрипт также уточнён: готовность PostgreSQL проверяется по TCP после завершения init, чтобы не принять временный init-сервер за окончательный. Первый созданный контейнер/сеть удалены. Продуктовые изменения для этих исправлений не потребовались.

## Android и выдаваемый APK

JDK21, SDK36, Gradle Wrapper8.14.3; запущен существующий AOSP Android36 x86_64 AVD без Google Play Services. Выполнены:

```powershell
# Из Client, с JDK21/SDK и коротким JVM tmpdir из README.
./gradlew.bat :core:test :app:lintStagingDebug :app:assembleStagingDebug :app:assembleStagingQa :app:assembleProdQa -PSYMBOLS_STAGING_URL=https://symbols-api.votarumshee.com -PSYMBOLS_PROD_URL=https://symbols-api.votarumshee.com
# Только при подтверждённой изолированной маршрутизации:
$env:SYMBOLS_TEST_URL='https://symbols-api.votarumshee.com'
./gradlew.bat :core:test --rerun-tasks
```

Все сборки PASS; staging lint0errors/23warnings/5hints, R8 и vital lint PASS. Второй Kotlin-прогон:10passed (9protocol,1реальный Ktor/OkHttp ServerIntegrationTest),3skipped (исторический import, opt-in локальный fault-proxy, traffic measurements). Первый unit-прогон без endpoint честно пропустил интеграцию; он не использован вместо второго.

`Client/scripts/qa-smoke.mjs` с `SYMBOLS_QA_VARIANT=stagingQa`, затем `prodQa`, точным acceptance marker и `SYMBOLS_NETWORK_REVIEW=yes`: оба PASS. Проверены регистрация, каталог/инвентарь, игра/события, отключение Wi-Fi/data, восстановление, Home/возврат, force-stop/восстановление партии, завершение. ProdQa восстановил связь через предусмотренный long-poll fallback, затем WSS после foreground/restart. Начальная проверка требовала исключительно WSS сразу после возврата сети; исправлена проверка транспорта, повторён полный prodQa сценарий без изменения APK. Это не симуляция, основанная только на компиляции.

APK: `Client/artifacts/delivery/symbols-prod-qa-1.0.0-20261007.apk`, Gitignored. Variant prodQa, applicationId `com.votarumshee.symbols.qa`, version1.0.0/code1, endpoint `https://symbols-api.votarumshee.com`, R8/shrinkResources, debuggable=false. SHA256:

`78fdf7e180b6adc442413494d43f187f2e264ed4595fb094c91c5dbe56ec9a4d`

Debug certificate SHA256 `5a45093829a45a385855f8e53ae806b56f13a30c62db661c1292ef780fc457f0`; APK signature v2 и zipalign -P16 прошли. Это QA APK, не магазинный release; production keystore не создавался. Manifest: [vds-qa-artifact.json](../../Client/release/vds-qa-artifact.json). Evidence: отдельные `Client/artifacts/qa-{stagingQa,prodQa}-emulator-5556.json` и соответствующие variant screenshots. Подробности и ограничения: [Client verification](../../Client/docs/verification.md).

## Резервирование и переключение

После Android тестов команда maintenance реально вернула503 снаружи и убрала тестовый marker. Создан свежий dump `20261007T142354Z`, затем успешно выгружен в Google Drive (обе systemd службы success/exit0, uploaded marker и remote snapshot проверены):

`48e1af6dbacf30a1412bf2fa2d0a9adabf88d940a33679a085f2be7cd0c72311`

Source time17:23:54МСК /14:23:54UTC. Ранее принятое скачивание/восстановление точного внешнего snapshot подтверждено root-owned external-restore.json: [external restore acceptance](vds-external-backup-verification.md). Новый snapshot не выдаётся за повторный full restore.

В17:27:23МСК /14:27:23UTC Caddy прошёл validate и reload. Менялось содержимое существующего файла (inode сохранён); БД и app не перезапускались, volumes и сертификаты сохранены. SHA256 локального, host и видимого внутри Caddy файла совпадают:

`8b37a26e4e6f4c4ec60e20561e51cfd74e808212684ce551b1beffff7dedde60`

`node Server/deploy/public-api-smoke.mjs`: trusted HTTPS health200/ready200, bootstrap без auth401, account-deletion200, metrics и metrics/404, HTTP308→HTTPS, HSTS, WSS без/с неверным bearer401. Временный marker отсутствует. Последний повтор завершился сам с exit0 в17:29:18МСК /14:29:18UTC; rejected WebSocket clients явно закрываются, чтобы проверки не оставляли открытые handles.

Монитор success/exit0, failed units0, DB/app healthy, новых server/Caddy error records после переключения0. После cleanup нет контейнеров/сетей с именами symbols-public-*; tmp credentials удалены. Синтетические Android sessions очищены из двух QA packages, созданный эмулятор остановлен. Несекретные route/resource записи и точная maintenance копия сохранены для диагностики.

## Независимая повторная проверка основным агентом

После сообщения субагента о переключении основной агент отдельно проверил внешний HTTPS: /health и /ready200, bootstrap401, account-deletion200, /metrics и /metrics/404, HSTS, HTTP308 и отсутствие X-Symbols-Acceptance. Отдельный WSS-клиент подтвердил401 без авторизации и штатно завершился с exit0. Изменяющих production-данные запросов не выполнялось.

По SSH независимо подтверждены совпадение SHA256 Caddyfile на Windows/хосте/в контейнере, proxy server:3000, отсутствие временных контейнеров/сетей symbols-public-*, healthy и0failed units, приватная привязка3000/отсутствие опубликованного5432, production0/676/456/3 и свежая внешняя копия. SHA256 выдаваемого APK совпал с манифестом; Gitignore и JSON результата prodQa с networkAndBackground=true проверены. Прочитаны сценарии E2E/UI и просмотрен скриншот завершённой тестовой партии. Итог независимой приёмки: PASS.

## Возврат в maintenance

```sh
sudo symbols-maintenance
```

Root-owned `/usr/local/sbin/symbols-maintenance` валидирует сохранённый `/etc/symbols/Caddyfile.maintenance`, пишет содержимое в текущий bind-mounted файл и делает reload. Команда проверена до открытия production, HTTPS503 подтверждён. Она не трогает БД, пользователей, backups или volumes. После отката подтвердить503 снаружи; для повторного открытия заново валидировать и установить принятую Caddyfile.production. Не восстанавливать старую БД ради нулевого счётчика пользователей.

## Остатки отдельного этапа

Внешние уведомления и внешний наблюдатель пока отсутствуют; локальный монитор не обнаружит полную потерю VDS. CI/CD, store release/подпись владельца/privacy/support материалы, физические Android устройства, длительная нагрузка и ёмкость не входят в выполненный smoke/E2E. Ни один текущий малый прогон не является нагрузочной приёмкой или гарантией производительности телефона.
