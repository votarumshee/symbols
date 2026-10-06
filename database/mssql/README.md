# Microsoft SQL Server

Целевая версия SQL Server 2022+ (16.x), база Unicode.
SQL Server/sqlcmd в среде экспорта отсутствовали. Создание/наполнение на этой
СУБД не выполнялось; приложение не поддерживает её без адаптации.

Пример Windows integrated authentication, из корня:
    sqlcmd -S localhost -E -b -f 65001 -d master -i database/mssql/00-create-database.sql
    sqlcmd -S localhost -E -b -f 65001 -d symbols_export -i database/mssql/01-schema.sql
    sqlcmd -S localhost -E -b -f 65001 -d symbols_export -i database/mssql/02-content.sql
    sqlcmd -S localhost -E -b -f 65001 -d symbols_export -i database/mssql/03-verify.sql

Для SQL-аутентификации используйте безопасный запрос пароля/секрет окружения,
не записывайте пароль в команды или файлы проекта.
Повторите 01 и 02: ожидается 676 записей / 456 связей / 0 сирот.
Unicode-литералы записаны с N'', данные JSON в NVARCHAR(MAX).
Проверяйте payload «Осмотр» и отсутствие искажений кириллицы/emoji.
Отличия: бинарная collation, ограниченные индексируемые строки, filtered UNIQUE
для nullable code, BIGINT времени/денег, NUMERIC для прежних дробных цен.
Подробнее ../README.md; адаптер приложения не реализован.
