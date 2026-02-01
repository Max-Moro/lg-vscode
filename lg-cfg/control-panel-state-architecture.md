# Архитектура State Management для Control Panel

Данный документ описывает внутреннюю реализацию подсистемы управления состоянием
Control Panel в VS Code Extension. Документ предназначен для разработчиков,
работающих над этой подсистемой.

---

## 1. Обзор архитектуры

Подсистема реализует однонаправленный поток данных (unidirectional data flow):

```
User Action → Renderer → Command → Coordinator → Rules → Store → ViewModel → Render
                                        ↑
                              Watchers (FileWatcher, ThemeWatcher)
```

### Ключевые принципы

1. **Единая точка истины** — всё состояние хранится в `PCEStateStore`
2. **Декларативные правила** — логика переходов состояния описана в бизнес-правилах
3. **Команды как намерения** — все изменения инициируются через типизированные команды
4. **Тонкие представления** — Views отвечают только за рендеринг и маршрутизацию

### Файловая структура

```
src/
├── state/                    # State Layer
│   ├── types.ts              # Типы состояния и команд
│   ├── store.ts              # PCEStateStore (синглтон)
│   ├── coordinator.ts        # StateCoordinator (синглтон)
│   ├── rules/                # Бизнес-правила
│   └── watchers/             # Слушатели внешних событий
│
├── viewmodel/                # ViewModel Layer
│   ├── types.ts              # Интерфейс ViewModel
│   └── builder.ts            # Чистая функция buildViewModel()
│
├── actions/                  # Actions Layer
│   ├── index.ts              # ActionDispatcher (синглтон)
│   ├── ListingActions.ts
│   ├── ContextActions.ts
│   ├── AiActions.ts
│   └── ToolbarActions.ts
│
└── views/                    # Views Layer (тонкие)
    ├── ControlPanelView.ts
    └── StatsWebview.ts
```

---

## 2. State Layer

### 2.1. PCEStateStore (`src/state/store.ts`)

Синглтон, хранящий всё состояние приложения. Название PCE отражает три типа состояния:

- **P (Persistent)** — сохраняется между сессиями в `workspaceState`
- **C (Configuration)** — загружается из CLI (списки контекстов, режимов, тегов)
- **E (Environment)** — детектируется при старте (провайдеры, платформа)

**Почему синглтон:** Гарантирует единую точку истины. Все компоненты работают с одним
экземпляром состояния, что исключает рассинхронизацию.

**Паттерн доступа:**
```typescript
import { getPCEStore } from "../state/store";
const store = getPCEStore(context);
```

**Основные методы:**
- `getState()` — полное состояние (для buildViewModel)
- `getPersistentState()` — только персистентная часть
- `updatePersistent(partial)` — обновление с сохранением
- `updateConfiguration(partial)` — обновление конфигурации
- `subscribe(listener)` — подписка на изменения
- `emit()` — уведомление подписчиков

**Query-методы** для вычисляемых значений:
- `getCurrentModes(ctx, provider)` — режимы для контекста/провайдера
- `getCurrentTags(ctx)` — теги для контекста
- `getIntegrationModeRuns(ctx, provider)` — строка runs для AI-провайдера

### 2.2. StateCoordinator (`src/state/coordinator.ts`)

Синглтон, оркестрирующий обработку команд через движок бизнес-правил.

**Почему отдельный класс:** Разделяет хранение данных (Store) и логику переходов
(Coordinator). Store не знает о правилах, Coordinator не хранит состояние напрямую.

**Паттерн доступа:**
```typescript
import { getCoordinator } from "../state/coordinator";
const coordinator = getCoordinator();
await coordinator.dispatch({ type: "SELECT_PROVIDER", providerId: "..." });
```

**Жизненный цикл команды:**
1. `dispatch(command)` — приём команды
2. Поиск правил по `trigger === command.type`
3. Проверка `condition(state, cmd)` для каждого правила
4. Вызов `apply(state, cmd)` → получение мутаций и async-операций
5. Применение мутаций к Store
6. Запуск async-операций (их результат — новые команды)
7. Обработка follow-up команд
8. Эмиссия состояния при достижении стабильности

**Стабильность:** Состояние считается стабильным когда нет pending async-операций.
Только стабильное состояние передаётся в ViewModel и рендерится.

**Meta-канал:** Отдельный канал `subscribeToMeta()` для UI-индикаторов загрузки.
Не блокируется ожиданием стабильности.

### 2.3. Business Rules (`src/state/rules/`)

Декларативное описание всех возможных переходов состояния.

**Структура правила:**
```typescript
interface BusinessRule<T extends Command["type"]> {
  id: string;           // Уникальный идентификатор для отладки
  description: string;  // Человекочитаемое описание
  trigger: T;           // Тип команды-триггера
  condition: (state, cmd) => boolean;  // Условие применения
  apply: (state, cmd) => RuleResult;   // Логика применения
}
```

**RuleResult может содержать:**
- `mutations` — изменения персистентного состояния
- `configMutations` — изменения конфигурации
- `asyncOps` — асинхронные операции (CLI-вызовы)
- `followUp` — команды для последующей обработки

**Модульная организация:**
- `provider.rules.ts` — смена провайдера, детекция провайдеров
- `context.rules.ts` — выбор контекста, загрузка секций
- `adaptive.rules.ts` — режимы, теги, ветки
- `tokenizer.rules.ts` — настройки токенизации
- `lifecycle.rules.ts` — INITIALIZE, REFRESH
- `cli-settings.rules.ts` — настройки CLI-провайдеров

**Каскадные правила:** Правила могут генерировать follow-up команды, создавая цепочки.
Например: `PROVIDERS_DETECTED` → `SELECT_PROVIDER` → `CONTEXTS_LOADED` → `SELECT_CONTEXT`
→ `MODE_SETS_LOADED`.

**Внешние зависимости:** Lifecycle-правила требуют внешних сервисов (AI detection,
Git branches). Они инжектируются через `setLifecycleDependencies()` при инициализации.

### 2.4. Watchers (`src/state/watchers/`)

Слушатели внешних событий, диспатчащие команды в Coordinator.

**FileWatcher** — следит за изменениями в `lg-cfg/`:
- Использует `vscode.FileSystemWatcher`
- Debounce 300ms для группировки событий
- Диспатчит `REFRESH` при изменениях

**ThemeWatcher** — следит за сменой темы VS Code:
- Подписка через `onDidChangeActiveColorTheme`
- Паттерн pub/sub для нотификации Views

**WatcherManager** — управляет жизненным циклом всех watchers.

---

## 3. ViewModel Layer

### 3.1. buildViewModel (`src/viewmodel/builder.ts`)

**Чистая функция** без побочных эффектов: `PCEState → ViewModel`.

**Почему чистая функция:** Гарантирует детерминированность. Одинаковое состояние
всегда даёт одинаковый ViewModel. Упрощает тестирование и отладку.

**Ответственности:**
- Извлечение текущих selections из персистентного состояния
- Построение массивов опций из конфигурации
- Вычисление флагов видимости (CLI settings, review mode branch)
- Подсчёт выбранных тегов

**Флаги видимости:**
- `cliSettingsVisible` — provider.endsWith(".cli")
- `claudeSettingsVisible` — provider === "com.anthropic.claude.cli"
- `codexSettingsVisible` — provider === "com.openai.codex.cli"
- `targetBranchVisible` — режим "review" активен И есть ветки

### 3.2. ViewModel Types (`src/viewmodel/types.ts`)

Типизированная структура данных для рендеринга. Содержит только то, что нужно
для отображения — никакой бизнес-логики.

---

## 4. Actions Layer

### 4.1. ActionDispatcher (`src/actions/index.ts`)

Синглтон, маршрутизирующий бизнес-операции к соответствующим модулям.

**Почему ActionDispatcher:** Централизует все бизнес-операции. Views вызывают
один метод вместо дублирования логики. Упрощает переиспользование между Views.

**Паттерн доступа:**
```typescript
import { getActionDispatcher } from "../actions";
const actions = getActionDispatcher();
await actions.sendToAI();
```

**Инициализация:** Происходит один раз в `ControlPanelView` через `initActionDispatcher(deps)`.
Все зависимости (store, coordinator, services) передаются при создании.

### 4.2. Action Modules

Каждый модуль — набор функций, принимающих deps и выполняющих операции.

**ListingActions:**
- `generateListing()` — генерация листинга секции
- `showIncluded()` — отображение включённых файлов
- `showSectionStats()` — статистика секции

**ContextActions:**
- `generateContext()` — генерация контекста
- `showContextStats()` — статистика контекста

**AiActions:**
- `sendToAI()` — отправка в AI-провайдер с валидацией

**ToolbarActions:**
- `refreshCatalogs()` — обновление каталогов
- `doctor()`, `resetCache()`, `updateAiModes()` и др.

---

## 5. Views Layer

### 5.1. Принцип тонких представлений

Views отвечают только за:
1. Жизненный цикл WebView (создание, HTML, dispose)
2. Маршрутизацию сообщений к Coordinator/ActionDispatcher
3. Подписку на Store и передачу ViewModel в рендерер

Views НЕ содержат:
- Бизнес-логику (вынесена в Actions)
- Валидацию состояния (вынесена в Rules)
- Прямые мутации состояния (только через dispatch)

### 5.2. ControlPanelView (`src/views/ControlPanelView.ts`)

Главная точка инициализации подсистемы.

**При resolveWebviewView:**
1. Инициализирует синглтоны (store, coordinator, dispatcher)
2. Регистрирует бизнес-правила
3. Запускает watchers
4. Подписывается на store → buildViewModel → postMessage
5. Диспатчит `INITIALIZE`

**Обработка сообщений:**
- `command` → `coordinator.dispatch()`
- action types → `actionDispatcher.method()`

### 5.3. StatsWebview (`src/views/StatsWebview.ts`)

Вторичное представление, переиспользующее инфраструктуру.

**Использует те же синглтоны:**
- `getCoordinator()` для dispatch команд (например SET_TASK_TEXT)
- `getActionDispatcher()` для бизнес-операций (sendToAI, generateContext)

**Почему не callback:** Ранее принимал callback `generate`. Теперь вызывает
`actions.generateContext()` / `actions.generateListing()` напрямую, что
исключает дублирование и гарантирует единообразное поведение.

---

## 6. Render Layer (JavaScript)

### 6.1. Stateless Renderer (`media/control.js`)

WebView-рендерер без собственного состояния.

**Принцип работы:**
1. Получает ViewModel через `postMessage({ type: "render", viewModel })`
2. Сравнивает с предыдущим ViewModel (diff)
3. Обновляет только изменившиеся части DOM
4. Пользовательские события конвертирует в Commands
5. Отправляет Commands обратно через `postMessage({ type: "command", command })`

**Diff-оптимизации:**
- `arraysEqual()` — сравнение массивов опций
- `modeSetsStructureEqual()` — структурное сравнение mode-sets
- `tagSetsStructureEqual()` — структурное сравнение tag-sets

Если структура не изменилась, обновляются только выбранные значения.

---

## 7. Команды (Commands)

Типизированные объекты, описывающие намерения.

### User Commands (от пользователя)
- `SELECT_PROVIDER`, `SELECT_CONTEXT`, `SELECT_SECTION`
- `SELECT_MODE`, `TOGGLE_TAG`
- `SET_TASK_TEXT`, `SELECT_TARGET_BRANCH`
- `SELECT_TOKENIZER_LIB`, `SET_ENCODER`, `SET_CTX_LIMIT`
- CLI settings: `SET_CLI_SCOPE`, `SELECT_CLI_SHELL`, etc.

### System Commands (от async-операций)
- `PROVIDERS_DETECTED`, `CONTEXTS_LOADED`, `SECTIONS_LOADED`
- `MODE_SETS_LOADED`, `TAG_SETS_LOADED`
- `ENCODERS_LOADED`, `TOKENIZER_LIBS_LOADED`, `BRANCHES_LOADED`

### Lifecycle Commands
- `INITIALIZE` — начальная загрузка
- `REFRESH` — перезагрузка каталогов

---

## 8. Инициализация и жизненный цикл

### Порядок инициализации

1. `ControlPanelView.constructor()`:
   - `getPCEStore(context)` — создание Store
   - `getCoordinator(store)` — создание Coordinator
   - `setLifecycleDependencies()` — инжекция внешних сервисов
   - `coordinator.setRules(ALL_RULES)` — регистрация правил
   - `new WatcherManager(coordinator)` — создание watchers
   - `initActionDispatcher(deps)` — создание ActionDispatcher

2. `resolveWebviewView()`:
   - Подписка на store → ViewModel → render
   - `watcherManager.startAll()` — запуск watchers
   - `coordinator.dispatch({ type: "INITIALIZE" })` — начало загрузки

3. Правило `initialize-bootstrap`:
   - async: detectProviders, loadSections, loadBranches, loadTokenizerLibs
   - Результаты приходят как System Commands
   - Каскад: PROVIDERS_DETECTED → SELECT_PROVIDER → CONTEXTS_LOADED → ...

### Очистка ресурсов

При `dispose()`:
- Отписка от store и meta listeners
- `watcherManager.dispose()` — остановка watchers

---

## 9. Расширение системы

### Добавление новой команды

1. Добавить тип в `src/state/types.ts` (UserCommand или SystemCommand)
2. Создать правило в соответствующем файле `src/state/rules/`
3. При необходимости — async-операцию, возвращающую SystemCommand

### Добавление нового Action

1. Создать функцию в соответствующем модуле `src/actions/`
2. Добавить метод в `ActionDispatcher`
3. При необходимости — обработчик в Views

### Добавление нового Watcher

1. Создать класс в `src/state/watchers/`
2. Добавить в `WatcherManager`
3. Вызывать `coordinator.dispatch()` при событиях
