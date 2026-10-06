# Client — «Символы»

Нативный Kotlin/Compose-клиент API v3. Независимая сборка из этой папки; Server нужен для работы и интеграционных тестов, но не для компиляции APK. История Initial commit сохранена. База ветки и SHA проверенного сервера: [dependency-manifest.json](docs/dependency-manifest.json).

## Инструменты и сборка

JDK 21, Android SDK Platform 36, Build Tools 36.0.0. Gradle 8.14.3 загружается Wrapper с проверкой SHA-256. Версии зависимостей в `gradle/libs.versions.toml`. minSdk 26, targetSdk/compileSdk 36.

Укажи SDK в `local.properties` (`sdk.dir=C\:/path/to/sdk` для Windows) или ANDROID_HOME. `local.properties` не коммитится. Из `Client/`:

```sh
./gradlew :core:test :app:assembleDevDebug :app:lintDevDebug
./gradlew :app:assembleDevQa
./gradlew :app:connectedDevDebugAndroidTest
```

Windows: `gradlew.bat`. Если JVM на Windows сообщает `Unable to establish loopback connection` в UnixDomainSockets, задай существующий короткий каталог через `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\path\tmp`. Это исправление пути JVM, а не отключение TLS/защиты.

`devDebug`: локальный Server на `http://10.0.2.2:8080` (Android-эмулятор). Для физического устройства используй `adb reverse tcp:8080 tcp:8080` и `-PSYMBOLS_DEV_URL=http://127.0.0.1:8080`. Cleartext разрешён только для loopback в devDebug/devQa.

`devQa`: R8 и shrinkResources как в release, без debuggable, **тестовая debug-подпись**, суффикс `.dev.qa`. Не для магазинов. Настоящий `release` всегда требует HTTPS и не подписывается автоматически тестовым ключом.

```sh
./gradlew :app:assembleStagingDebug -PSYMBOLS_STAGING_URL=https://YOUR-STAGING-HOST
./gradlew :app:bundleProdRelease :app:assembleProdRelease \
  -PSYMBOLS_PROD_URL=https://YOUR-PRODUCTION-HOST \
  -PSYMBOLS_PRIVACY_URL=https://YOUR-POLICY-URL \
  -PSYMBOLS_SUPPORT_URL=https://YOUR-SUPPORT-URL
```

Значения YOUR-* — инструкции владельцу, не встроенные адреса. Без настоящего URL release-сборка останавливается. Staging/prod имеют отдельные базы Server; не подключай dev к данным игроков. Package `com.votarumshee.symbols`, версия 1.0.0/1 требуют подтверждения владельца перед первым выпуском.

## Реальная интеграция

Подними Server по его README, мигрируй/засей отдельную тестовую PostgreSQL, PORT=8080. Установи `SYMBOLS_TEST_URL=http://127.0.0.1:8080` перед `:core:test`. Без этой переменной интеграционный тест явно пропускается. Unit-тесты не заменяют его. Тест создаёт синтетический аккаунт и удаляет его; не используй production.

Архитектура: `core/Models` — DTO/точные деньги/редуктор; `Api` — один Ktor/OkHttp client; `Repository` — единственный поток событий и команды; `app/SecureStore` — AES-GCM Android Keystore, atomic journal в noBackupFilesDir; `GameViewModel` — намерения пользователя; Compose — состояние и Canvas. DataStore содержит только настройки эффектов. Профиль/поле живут в памяти; каталог кешируется до 2 МБ и 7 дней, валидируется серверной версией.

Сверка после неопределённого ответа: сохраняется исходный commandId и тело; покупки повторяются с тем же ключом в пределах 7 дней, ходы после перезапуска не переотправляются. По завершении обычного хода нет отдельной загрузки профиля/каталога. В фоне соединение закрывается через 3 секунды; бот/таймер остаются на сервере. Ping сервера раз в 20 секунд, OkHttp отвечает pong.

Матрица переноса: [feature-matrix.md](docs/feature-matrix.md). Материалы магазинов и подписи — `release/`. Фактически проведённые проверки — `docs/verification.md`. Не считай этот репозиторий свидетельством публикации.

Для приёмки начни с [OWNER-REVIEW.md](release/OWNER-REVIEW.md). Контрольные суммы подготовленных APK/AAB — [artifact-manifest.json](release/artifact-manifest.json). Локальные файлы лежат в `artifacts/delivery/`; они намеренно исключены из Git. CI прикладывает заново собранные тестовые APK к своему запуску.

## Подпись и секреты

Переменные окружения: SYMBOLS_KEYSTORE (абсолютный путь вне репозитория), SYMBOLS_STORE_PASSWORD, SYMBOLS_KEY_ALIAS, SYMBOLS_KEY_PASSWORD. Пароли не передавай аргументами команды, через чат или в CI artifacts. Используй локальный менеджер секретов/секреты CI. Release signing config существует только при заданном keystore.

App signing key контролирует владелец; upload key Google Play — отдельный. Перед Play App Signing согласуй импорт app signing key, чтобы установленный Play APK имел тот же сертификат, что RuStore APK. Не регистрируй пакет/не отправляй на модерацию до проверки конкретных файлов владельцем.

Оригинальная графика адаптируется командой `node scripts/export-art.mjs` из корня Client (требует исходный `dist/` только при повторной генерации). Ресурсы уже включены в проект. Никакого JavaScript/WebView в Android нет.
