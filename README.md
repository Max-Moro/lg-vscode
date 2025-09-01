# Listing Generator — VS Code Extension

Интеграция редактора VS Code с CLI-утилитой **Listing Generator (LG)**: быстро генерируйте единый plain-text листинг исходников, контекст-промты по шаблонам, список включённых файлов и статистику токенов — прямо из VS Code.

> Этот проект — подпроект репозитория LG. Он не заменяет CLI, а дополняет его удобным UI в VS Code.

---

## Возможности

- **Control Panel (боковая панель)**  
  Кнопки и выпадающие списки для частых операций:
  - Generate Context (выбор шаблона из `lg-cfg/contexts/**.tpl.md`);
  - Generate Listing (секция + режим `all/changes`);
  - Show Included (список файлов, прошедших фильтры);
  - Show Stats (таблица размеров/токенов с долями контекста);
  - Create Starter Config; Doctor; Settings.

- **Included Files (вьюха)**  
  Дерево путей «что войдёт в листинг». Клик открывает файл.

- **Virtual Documents**  
  Результаты Listing/Context открываются как read-only документы `lg://…`.

- **JSON-интеграция с CLI**  
  Расширение использует JSON-режим CLI (`--json`) для списков секций/шаблонов, included-пути, статистики и «доктора».

- **Ненавязчивая установка CLI**  
  Три стратегии:
  - `system` — использовать ваш Python/CLI без вмешательства;
  - `managedVenv` — изолированная автоустановка внутри расширения (по умолчанию);
  - `pipx` *(планируется)*.

---

## Требования

- VS Code 1.85+
- Python 3.8+ (для работы CLI)
- Git (для режима `changes`)
- Установленный CLI **listing-generator** (или включён `managedVenv`)

---

## Быстрый старт

1. Откройте проект в VS Code.  
2. Установите расширение (локально из исходников → F5, или из Marketplace, когда появится).  
3. Откройте в Activity Bar иконку **Listing Generator**.  
4. Если в проекте нет конфигурации — нажмите **Create Starter Config**.  
5. Выберите **Section** / **Mode** и запустите **Generate Listing** или **Generate Context**.

> Конфигурация проекта хранится в `lg-cfg/config.yaml` и `lg-cfg/contexts/**.tpl.md` (см. документацию CLI).
<!-- lg:omit:start -->
---

## Установка

### Вариант A: Dev-режим (из исходников)
```bash
# В папке vscode-lg/
npm install
# Запуск отладки расширения:
# VS Code → F5 (Run Extension)
````

### Вариант B: Marketplace *(после публикации)*

Откройте Marketplace, найдите **Listing Generator**, установите.

---

## Настройки (User/Workspace)

| Ключ                    | Тип                                   | По умолчанию    | Описание                                                        |                  |
| ----------------------- | ------------------------------------- | --------------- | --------------------------------------------------------------- | ---------------- |
| `lg.mode`               | \`"all"                               | "changes"\`     | `"all"`                                                         | Режим генерации. |
| `lg.defaultSection`     | `string`                              | `"all-src"`     | Секция из `lg-cfg/config.yaml`.                                 |                  |
| `lg.defaultTemplate`    | `string`                              | `""`            | Шаблон (без `.tpl.md`).                                         |                  |
| `lg.codeFence`          | `boolean \| null`                     | `null`          | Переопределение fenced-блоков (если нужно).                     |                  |
| `lg.modelForStats`      | `string`                              | `"o3"`          | Модель для оценок контекста.                                    |                  |
| `lg.python.interpreter` | `string`                              | `""`            | Путь к Python, если используете стратегию `system`.             |                  |
| `lg.cli.path`           | `string`                              | `""`            | Явный путь к `listing-generator` (если хотите миновать Python). |                  |
| `lg.install.strategy`   | `"managedVenv" \| "system" \| "pipx"` | `"managedVenv"` | Способ получения CLI.                                           |                  |
| `lg.telemetry`          | `boolean`                             | `false`         | Анонимная телеметрия (отключена по умолчанию).                  |                  |

**Рекомендация для разработчиков CLI:**
Укажите `lg.install.strategy = "system"` и путь к вашему venv-интерпретатору:
`lg.python.interpreter = "C:\\path\\to\\lg\\.venv\\Scripts\\python.exe"` — расширение будет вызывать `python -m lg.cli`.

---

## Команды (Command Palette)

* `LG: Generate Context (Template)`
* `LG: Generate Listing (Section)`
* `LG: Show Included Paths`
* `LG: Show Stats`
* `LG: Create Starter Config`
* `LG: Doctor (Self Check)`
* `LG: Re-run Last` *(WIP)*

---

## Архитектура расширения (вкратце)

* Ядро на TypeScript:

  * `runner/` — обнаружение/установка CLI, запуск внешнего процесса, JSON-хелперы.
  * `views/` — VirtualDocProvider, IncludedTree, ControlPanel (webview), Stats webview.
  * `diagnostics/Doctor` — отчёты из `--doctor --json`.
  * `starter/` — генерация стартовой конфигурации проекта.

* CLI-протокол: **protocol = 1**
  JSON-результаты для:

  * `--list-sections`, `--list-contexts`
  * `--list-included`
  * `--list-included --stats`
  * `--doctor`

> Текстовый вывод CLI по-прежнему поддерживается (обратная совместимость), расширение предпочитает JSON.

---

## Сценарии установки CLI

1. **System / dev**
   Настройте `lg.python.interpreter` **или** `lg.cli.path`.
   Пример (Windows, dev-venv):

   ```jsonc
   // .vscode/settings.json
   {
     "lg.install.strategy": "system",
     "lg.python.interpreter": "C:\\path\\to\\lg\\.venv\\Scripts\\python.exe"
   }
   ```

2. **Managed Venv (по умолчанию)**
   Расширение создаст изолированный venv в `globalStorage/.venv-lg` и поставит туда `listing-generator`.

---

## Отладка и разработка

* `npm run watch` — инкрементальная сборка TS.
* **F5** — запуск «Extension Development Host».
* Журналы: *Output* → *Log (Extension Host)*.
* Пакет: `vsce package` → `*.vsix`.

---

## Известные ограничения

* Статистика считает токены с помощью `tiktoken`. Токенизация может отличаться от конечной модели.
* В режиме `changes` нужен установленный Git и корректный репозиторий.
* Remote/WSL — поддерживается, но установка CLI происходит на удалённой стороне (уточняйте права/прокси).

---

## FAQ

**Q:** Почему результаты открываются в read-only вкладках?<br/>
**A:** Это виртуальные документы. Их удобно копировать/передавать без лишних файлов на диске.

**Q:** Где включается fenced-обёртка?<br/>
**A:** По умолчанию — как настроено в `lg-cfg/config.yaml`. Можно временно переопределить через настройку `lg.codeFence`.
<!-- lg:omit:end -->