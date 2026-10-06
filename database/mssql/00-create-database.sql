-- Execute with sqlcmd connected to master:
IF DB_ID(N'symbols_export') IS NULL
    CREATE DATABASE [symbols_export] COLLATE Latin1_General_100_BIN2;
GO
