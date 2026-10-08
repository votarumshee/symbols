# D1 / SQLite: оригинал

Рабочий сервер: Cloudflare D1, точная версия SQLite неизвестна.
Локально проверено Node 24.19.0 / SQLite 3.53.3; требуется SQLite с JSON,
RETURNING и оконченными миграциями (рекомендуется 3.45+).

В migrations/ — неизменённые оригинальные Drizzle SQL и snapshots.
01-schema.sql — подготовленная при экспорте итоговая структура для пустой БД.
Не применяйте её и исходные миграции к одной новой базе одновременно.

Рекомендуемый запуск из корня:
    node scripts/init-db.mjs data/symbols.sqlite

Альтернатива через sqlite3 (из корня, предварительно mkdir data):
    sqlite3 data/symbols.sqlite ".read database/original/01-schema.sql"
    sqlite3 data/symbols.sqlite "PRAGMA foreign_keys=ON;" ".read database/original/02-content.sql"
    sqlite3 data/symbols.sqlite ".read database/original/03-verify.sql"

Проверено создание с миграциями и прямой итоговой схемой, наполнение,
повторный запуск, integrity_check=ok, отсутствие ошибок внешних ключей.
В D1 создайте отдельную БД своим аккаунтом и примените исходные миграции
по порядку 0000–0005; production Sites не используйте.
Справочники game_content дополнены при экспорте, оригинальная игра их не читает.
