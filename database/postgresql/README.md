# PostgreSQL

Целевая версия 16+. Это новая схема-представление оригинального SQLite.
При дополнительной проверке 6 октября 2026 года SQL выполнен на PostgreSQL 17
в отдельном временном кластере на Windows. Создание базы, схема, наполнение и
повторный запуск 01/02 прошли успешно: 676 записей, 456 связей, 0 сирот;
кириллица в payload сохранена. Код приложения требует отдельного адаптера.

В shell с настроенной безопасной аутентификацией:
    psql -X -v ON_ERROR_STOP=1 -d postgres -f database/postgresql/00-create-database.sql
    psql -X -v ON_ERROR_STOP=1 -d symbols_export -f database/postgresql/01-schema.sql
    psql -X -v ON_ERROR_STOP=1 -d symbols_export -f database/postgresql/02-content.sql
    psql -X -v ON_ERROR_STOP=1 -d symbols_export -f database/postgresql/03-verify.sql

Пароли не передавайте в аргументах и не коммитьте. Используйте .pgpass
с ограниченными правами или системный механизм аутентификации.
Повторите 01 и 02: ожидается 676 записей / 456 связей / 0 сирот.
Текст payload для symbol/inspect должен содержать «Осмотр».
Скрипт создания самой БД выполняется вне транзакции один раз.
Отличия типов, ограничений и необходимого адаптера — ../README.md и корневой README.
