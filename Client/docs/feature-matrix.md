# Матрица переноса v45 → Client

Эталон: `8c953993d57a887112a75c4b0a69bb2a376ea1eb`, актуальные `dist/next.mjs`, `engine.mjs`, `accounts.mjs`, `tutorial.mjs`. Локальная экспортированная игра запущена на 8787 с отдельной синтетической SQLite. Проверены первый запуск и главное меню через браузер. Исторический RULES.md не использован как источник баланса.

Матрица описывает реализацию, а не обещает прохождение всех проверок. Фактические результаты фиксируются отдельно в verification.md.

| Исходный экран/сценарий | Client | Проверка приёмки |
|---|---|---|
| Первый запуск, ник | LoginScreen | Создание только по кнопке, ошибка не создаёт пустой профиль |
| showRecovery / старый код | LoginScreen + ProfileScreen | Старый импорт, тот же ID и полный прогресс, перезапуск |
| showAccounts | AccountsScreen | Переключение, очистка экрана и подписки, нет чужого кеша |
| home, top, levelBlock | HomeScreen, ProfileScreen | Баланс в сотых; XP/звание с сервера |
| modes, showRoom | ModeScreen | play/duel/team/trial/local/room, отмена, код |
| play, boardCells | MatchScreen / Canvas | 10×14 и 28×20, обе стороны, крайний ряд короля |
| chooseCell / direction-picker | Выбор клетки + подтверждение | Направления 0–7, перенос с source, удаление, два хода |
| очередь, боты, 90 секунд | MatchScreen | События без polling; сервер продолжает в фоне |
| resultPanel | MatchScreen | Победа/поражение, опыт, задания, следующее испытание |
| coach / tutorialAdvice | Подсказки первой партии | Оригинальный tutorialAdvice исполняется Server, Client показывает текст и выделяет рекомендуемый ход |
| animateShots / skins / rank-art | Canvas, каталог косметики | 112 SVG, исходные PNG званий/аватарок; траектории из Server; нативные рамки. Полный визуальный прогон остаётся |
| showRules | RulesScreen | Тексты из актуального next.mjs, лимиты из каталога |
| quests / showLevels | QuestScreen / ProfileScreen | Каталог, история и награды; уровень >300 — серверная проекция, проверенная тестом |
| inventory, showItem | CollectionScreen | Счётчики, кейсы, продажа, скин и точная цена |
| upgrades | CollectionScreen | Текущий уровень, цена каталога, max |
| shop, showCase | CollectionScreen | Цена/вероятности, купить/открыть, серверный результат |
| skinShop, showAvatars, showFrames | CollectionScreen | Владение, покупка, выбор, доступность по уровню |
| market / marketOffers | MarketScreen | Пагинация 60, сортировка, фильтр, покупка/отмена |
| Сбой сети / повтор покупки | Repository + журнал | Тот же commandId, неизвестный результат виден |
| Жалобы / блокировки / удаление | ReportControls / SettingsScreen | Реальные команды и результат оператора Server |
| Промокоды, arbitrary avatar, instant | Не включены | Запрещённые кнопки отсутствуют |

Не согласованные исключения не считаются выполненными критериями. Публичный выпуск блокируется оставшимися строками проверки, а также отсутствующими доменами/контактами/подписью владельца.
