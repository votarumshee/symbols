# Лицензии Client

Приложение и адаптированные материалы — GPL-3.0, LICENSE в корне репозитория сохранён. Первоначальное авторство и Initial commit Alexandr Vologodskiy не изменены.

Исходные SVG `dist/icons.mjs`, `dist/skin-icons.mjs` и PNG `rank-atlas.png`, `thunder-lion.png`, `fire-c.png` перенесены из проверенного экспорта. Происхождение PNG описано в корневом THIRD_PARTY_NOTICES.md: сгенерированы для этого проекта; исходных редактируемых слоёв нет. Геометрия SVG сохранена, CSS-анимации адаптируются к Compose. Emoji и шрифты системные.

Kotlin, kotlinx.coroutines, kotlinx.serialization, Ktor, AndroidX, OkHttp, Okio и AndroidSVG распространяются по Apache-2.0; Gradle — Apache-2.0; JUnit — EPL-1.0 (только тесты). Полный фактический список зависимостей выпуска получают через `gradlew :app:dependencies --configuration prodReleaseRuntimeClasspath`. GPL исходники должны соответствовать конкретному опубликованному APK/AAB; сохранить git SHA, source archive, версии и notice каждого компонента. Права на название/ассеты подтверждает владелец до отправки в магазины.
