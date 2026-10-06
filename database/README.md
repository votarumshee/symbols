# Три комплекта БД

original: фактический D1/SQLite, исходные миграции сохранены.
postgresql: новая эквивалентная схема для PostgreSQL 16+ (целевая версия).
mssql: новая эквивалентная схема для SQL Server 2022+ (целевая версия).

Сначала создайте отдельную пустую БД, затем 01-schema.sql, 02-content.sql,
03-verify.sql. Не выполняйте эти файлы на рабочей БД Sites.

## Схема оригинала и отличия

9 исходных таблиц:
profiles (профили/старое состояние), matches (старые матчи), recovery,
recovery_limits, vaults (актуальные аккаунты в JSON), arenas (матчи в JSON),
listings (предложения), operations (транзакционные квитанции), account_sessions.

Оригинал не объявляет FOREIGN KEY между этими таблицами. Экспорт не добавляет
придуманные ограничения: profiles.match_id ↔ matches.id, listings.seller/buyer ↔
profiles.id, vaults.profile_id ↔ profiles.id и прочие связи проверяет приложение.
В operations.owner допустимы служебные значения, например tick.
JSON в vaults.data содержит inventory, ownedSkins, skins, upgrades, cases,
claims, balanceCents, xp и history. JSON матча содержит список игроков/поле.
Их формат смотрите server/v2.mjs, server/arena-engine.mjs. JSON оставлен текстом
во всех вариантах, чтобы не менять формат и допустимость исторических данных.

Новые game_content и game_content_links содержат только справочное наполнение.
Для их связей объявлены составные внешние ключи и первичные ключи.

SQLite INTEGER — signed 64-bit, в PG/MSSQL заменён BIGINT. Исторический price
в SQLite имеет INTEGER affinity, но допускает дроби; PG/MSSQL использует
NUMERIC(22,2). Основная цена price_cents — целое число сотых рубина.
SQLite TEXT не ограничен. PG использует TEXT COLLATE "C".
MSSQL использует NVARCHAR(MAX) для JSON и NVARCHAR(256) для индексируемых строк,
бинарную сортировку Latin1_General_100_BIN2. Это ограничение длины отсутствует
в SQLite, но все идентификаторы/тексты, создаваемые текущим приложением,
помещаются. Семантика сравнения пробелов у MSSQL отличается от SQLite.
Идентификаторы не преобразованы в UUID: в оригинале встречаются UUID,
hex-строки и служебные значения. Времена остаются Unix milliseconds BIGINT.

Уникальный nullable matches.code в MSSQL имеет фильтр IS NOT NULL, чтобы,
как в SQLite/PG, разрешить несколько NULL. Остальные индексы и defaults
перенесены. Не добавлены триггеры, процедуры, sequences: в оригинале их нет.

## Повторный запуск

Оригинальные migrations не идемпотентны сами по себе. scripts/init-db.mjs
ведёт _export_migrations, повторно их не применяет.
01-schema создаёт только отсутствующие таблицы/индексы: это bootstrap,
не инструмент обновления произвольно изменённой схемы.
02-content в транзакции заменяет только две экспортные справочные таблицы,
не трогает игровые таблицы. Содержимое повторно идентично.
00-create PostgreSQL выполните один раз; повтор даст database already exists.
MSSQL 00-create проверяет существование; SQLite создаётся открытием файла.

## Проверка

Ожидается 676 строк game_content, 456 строк game_content_links, orphan_links=0.
Разбивка по категориям: ../database/expected-counts.json.
SQL-файлы трёх СУБД сгенерированы из одного database/content.json.
Проверьте возврат Unicode «Осмотр», «Фиолетовый неон», emoji и JSON.
Никакие production-строки не включены.
