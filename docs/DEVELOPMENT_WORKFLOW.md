# Процесс разработки

Общие правила проекта — в [AGENTS.md](../AGENTS.md) (их же подключает [CLAUDE.md](../CLAUDE.md)).
Этот документ описывает, как задача проходит путь от согласования до `main`.

## Роли

- **Владелец проекта** формулирует и утверждает задачи, игровые решения и баланс, проверяет
  Cloudflare Preview и единственный выполняет merge в `main`.
- **Claude Code** — основной разработчик: реализует утверждённую задачу в отдельной ветке, пишет
  тесты и документацию, открывает Pull Request и исправляет замечания ревью.
- **OpenAI Codex** — независимый ревьюер каждого PR по разделу «Review guidelines» в AGENTS.md.

## Жизненный цикл задачи

1. **Спецификация.** Владелец описывает задачу (номер `Task NN`, цель, границы, что не входит).
   Если требования неоднозначны или затрагивают инварианты, разработчик задаёт вопросы _до_
   реализации. Следующая задача не начинается без явного запроса.
2. **Ветка.** От свежего `main`:

   ```bash
   git fetch origin main
   git switch -c feature/task-07-skills origin/main
   ```

   Префиксы: `feature/task-NN-<slug>` — задачи, `fix/<slug>` — исправления, `chore/<slug>` —
   инфраструктура, `docs/<slug>` — документация. Сессии агентов могут использовать назначенную
   ветку вида `claude/<slug>`. Одна ветка — одна задача; длинные ветки регулярно обновляются от
   `main` (merge или rebase собственной, ещё не ревьюированной ветки).

3. **Реализация.** Аддитивные изменения модулей, сохранение существующих API и инвариантов,
   тесты рядом с текущими наборами в `tests/<module>/`, обновление `docs/` и `README.md`.
4. **Локальная проверка** перед push (AGENTS.md §6):

   ```bash
   npm run typecheck && npm test && npm run format:check && npm run build
   ```

   Плюс `npm run test:production` и `npm run test:e2e` (с запущенным `npm run dev`), если
   затронуты сборка, DEV-режим, UI, ввод, сцена или интеграция `GameplayWorld`.

5. **Pull Request** в `main` по шаблону `.github/pull_request_template.md`: что сделано, какие
   игровые значения изменены (старое → новое), какие тесты добавлены, что не проверено.
6. **CI** (GitHub Actions, `.github/workflows/ci.yml`) должен быть зелёным.
7. **Code review Codex** (см. ниже). Каждое замечание исправляется отдельным коммитом или получает
   аргументированный ответ в треде.
8. **Cloudflare Preview** — владелец (и при необходимости разработчик) проверяет сборку PR в
   браузере.
9. **Merge** выполняет только владелец, после зелёного CI, закрытых замечаний и одобрения
   геймплея. Рекомендуемый способ — **Squash and merge** с заголовком `Task NN: …`. После merge
   ветка удаляется; продолжение работы — новая ветка и новый PR.

## Continuous Integration

Workflow `CI` запускается на каждый PR, на push в `main` и вручную (`workflow_dispatch`).
Node.js берётся из `.node-version` (24.19.0), зависимости — `npm ci` из lockfile.

| Job                                          | Что проверяет                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Typecheck, format and unit tests`           | `npm run typecheck`, `npm run format:check`, `npm test` (Node-тесты прототипа и все наборы Vitest)                                |
| `Production build and production regression` | `npm run build` (команда сборки, задокументированная для Cloudflare) и `npm run test:production`; `dist` сохраняется как artifact |
| `Browser end-to-end (dev server)`            | Поднимает Vite dev server и запускает `npm run test:e2e` (прототип и альфа, включая DEV-сценарии); скриншоты — artifact           |

Браузерные тесты используют Google Chrome, предустановленный в образе `ubuntu-24.04`
(`CHROMIUM_PATH=/usr/bin/google-chrome`). Предупреждение Vite о размере Phaser-бандла не является
ошибкой. Новые тестовые наборы нужно добавлять в `vitest.config.ts`, иначе CI их не запустит.

## Code review

- Codex подключается к репозиторию в настройках Codex (Code review → включить для `pavnem-ux/Game`).
  Можно включить автоматическое ревью каждого PR или запрашивать его комментарием `@codex review`
  в PR. Codex учитывает раздел **Review guidelines** из `AGENTS.md`.
- Уровни замечаний: **P0** — нарушение инварианта/сломанный production, **P1** — ошибка или нет
  теста на требуемое поведение, **P2** — сопровождаемость/производительность, **nit**.
  P0 и P1 блокируют merge.
- Разработчик исправляет только то, что требует замечание, добавляет регрессионный тест, отвечает
  в треде, что изменено, и повторно запрашивает ревью. Несогласие с замечанием аргументируется в
  треде; спорные игровые вопросы решает владелец.
- Ни один агент не делает approve собственного PR и не выполняет merge.

## Тестирование в Cloudflare Preview

Репозиторий подключён к Cloudflare через GitHub App как проект **Workers Builds `game`**
(статическая сборка, без Worker-скрипта). Настройки проекта (Settings → Builds):

| Сборка                                 | Build command   | Deploy / Preview command | Root directory |
| -------------------------------------- | --------------- | ------------------------ | -------------- |
| Production (ветка `main`)              | `npm run build` | `npx wrangler deploy`    | пусто (`/`)    |
| Previews Base (все остальные ветки/PR) | `npm run build` | `npx wrangler preview`   | `/`            |

Что выкладывать, задаёт [`wrangler.jsonc`](../wrangler.jsonc) в корне репозитория: имя `game`,
статические файлы из `dist`, SPA fallback (`not_found_handling: single-page-application`) и
пустой блок `previews`, без которого `wrangler preview` (Cloudflare Previews, open beta)
завершается ошибкой. Изменения этого файла влияют и на production и согласуются с владельцем.

Как устроен процесс после настройки:

1. После push в ветку PR Cloudflare собирает production-версию (`npm run build`, каталог `dist`).
   Статус появляется в PR как check `Workers Builds: game`, а ссылка — в комментарии бота Cloudflare («Preview Deployments by
   commit»). Тот же статус и логи — в **Workers & Pages → game → Deployments / Builds**.
2. Адрес preview берётся **только из комментария/дашборда Cloudflare**, не угадывается
   (`wrangler preview` по умолчанию называет Preview по имени git-ветки).
3. Preview — это **production-сборка**: DEV-панели, `/?debug` и `window.__alpha` там нет, так и
   задумано. Механики, требующие DEV-инструментов, проверяются локально (`npm run dev`, `/?debug`)
   и через `npm run test:e2e`.
4. Минимальный checklist для playable-изменений: страница загружается без ошибок в DevTools; забег
   за каждый затронутый класс; новая механика работает как описано в PR; пауза/продолжение;
   смерть → Revive → вторая смерть; телефонный размер экрана и джойстик; `/?debug` не показывает
   DEV. Полный список — в разделе «Live verification checklist» документа деплоя.
5. Результат (URL preview и что проверено) отмечается в PR. Preview по умолчанию доступен любому,
   у кого есть ссылка; при необходимости доступ ограничивается через Cloudflare Access.

## Ручная настройка репозитория (выполняет владелец)

1. **Branch protection / ruleset для `main`** (Settings → Rules → Rulesets или Branches): запрет
   прямого push и force-push; merge только через PR; обязательные status checks — три job'а
   workflow `CI`; требовать актуальность ветки и разрешение всех обсуждений. Если PR создаются от
   имени аккаунта владельца, обязательное число approvals оставить 0 — GitHub не позволяет
   одобрять собственный PR.
2. **Codex code review** — включить для `pavnem-ux/Game` в настройках Codex и создать для
   репозитория environment в Codex Cloud (Settings → Environments): бот `chatgpt-codex-connector`
   сообщил в PR #1, что без него `@codex review` не выполняется.
3. **Cloudflare** — проверено владельцем 01.11.2026: production branch `main`, настройки сборки как
   в таблице выше, «Builds for Preview branches» включены. Если Cloudflare сменит команды по
   умолчанию, сверить их с таблицей; ошибки сборки смотреть по ссылке «View logs» в PR.
4. **GitHub Actions** — разрешены для репозитория (Settings → Actions → General). Workflow не
   использует секреты.
