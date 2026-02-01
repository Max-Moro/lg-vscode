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
2. **Декларативные правила** — логика переходов описана в доменных модулях
3. **Namespace-команды** — все команды имеют формат `domain/ACTION`
4. **Модульность** — домены и провайдеры самодостаточны
5. **Тонкие представления** — Views отвечают только за рендеринг

### Файловая структура

```
src/
├── state/                    # State Layer
│   ├── types.ts              # Базовые типы (BaseCommand, BusinessRule, PCEState)
│   ├── store.ts              # PCEStateStore (синглтон)
│   ├── coordinator.ts        # StateCoordinator (синглтон)
│   ├── domains/              # Доменные модули (бизнес-правила)
│   │   ├── index.ts          # Регистрация доменов
│   │   ├── context.ts        # context/* команды
│   │   ├── section.ts        # section/* команды
│   │   ├── adaptive.ts       # adaptive/* команды
│   │   ├── provider.ts       # provider/* команды
│   │   ├── tokenization.ts   # tokenization/* команды
│   │   └── lifecycle.ts      # lifecycle/* команды
│   └── watchers/             # Слушатели внешних событий
│
├── services/ai/providers/    # AI Provider Layer
│   ├── claude-cli/
│   │   ├── ...
│   │   └── settings.ts       # provider.claude-cli/* команды
│   ├── codex-cli/
│   │   ├── ...
│   │   └── settings.ts       # provider.codex-cli/* команды
│   └── ...
│
├── viewmodel/                # ViewModel Layer
│   ├── types.ts              # ViewModel + ProviderSettingsContribution
│   └── builder.ts            # Чистая функция buildViewModel()
│
├── actions/                  # Actions Layer
│   ├── index.ts              # ActionDispatcher
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
- **E (Environment)** — детектируется при старте (провайдеры)

**Паттерн доступа:**
```typescript
import { getStore } from "../bootstrap";
const store = getStore();
```

**Основные методы:**
- `getState()` — полное состояние (для buildViewModel)
- `getPersistentState()` — только персистентная часть
- `updatePersistent(partial)` — обновление с сохранением
- `updateConfiguration(partial)` — обновление конфигурации
- `subscribe(listener)` — подписка на изменения

**Расширяемое хранение настроек провайдеров:**
```typescript
// PersistentState содержит:
providerSettings: Record<string, Record<string, unknown>>
// Например: providerSettings["claude-cli"] = { model: "sonnet", method: "continue" }
```

### 2.2. StateCoordinator (`src/state/coordinator.ts`)

Синглтон, оркестрирующий обработку команд через движок бизнес-правил.

**Паттерн доступа:**
```typescript
import { getCoordinator } from "../bootstrap";
const coordinator = getCoordinator();
await coordinator.dispatch({ type: "provider/SELECT", providerId: "..." });
```

**Жизненный цикл команды:**
1. `dispatch(command)` — приём команды
2. Поиск правил по `trigger === command.type` (string matching)
3. Проверка `condition(state, cmd)` для каждого правила
4. Вызов `apply(state, cmd)` → получение мутаций и async-операций
5. Применение мутаций к Store
6. Запуск async-операций (их результат — новые команды)
7. Обработка follow-up команд
8. Эмиссия состояния при достижении стабильности

**Стабильность:** Состояние считается стабильным когда нет pending async-операций.
Только стабильное состояние передаётся в ViewModel и рендерится.

### 2.3. Domain Modules (`src/state/domains/`)

Каждый домен — самодостаточный модуль, содержащий:
- Типы команд домена
- Бизнес-правила для этих команд
- Экспорт `DomainModule`

**Структура доменного модуля:**
```typescript
// src/state/domains/context.ts

// Команды домена
export interface SelectContextCmd extends BaseCommand {
  type: "context/SELECT";
  template: string;
}

// Правила
const contextSelect: BusinessRule = {
  id: "context/select",
  description: "When context is selected, reload mode-sets and tag-sets",
  trigger: "context/SELECT",
  condition: (_state, cmd) => !!cmd.template,
  apply: (state, cmd) => ({
    mutations: { template: cmd.template },
    asyncOps: [...]
  })
};

// Экспорт модуля
export const contextDomain: DomainModule = {
  id: "context",
  rules: [contextSelect, ...]
};
```

**Доступные домены:**

| Домен | Файл | Команды |
|-------|------|---------|
| context | `context.ts` | `context/SELECT`, `context/SET_TASK`, `context/LOADED` |
| section | `section.ts` | `section/SELECT`, `section/LOADED` |
| adaptive | `adaptive.ts` | `adaptive/SELECT_MODE`, `adaptive/TOGGLE_TAG`, `adaptive/SELECT_BRANCH`, `adaptive/MODE_SETS_LOADED`, `adaptive/TAG_SETS_LOADED`, `adaptive/BRANCHES_LOADED` |
| provider | `provider.ts` | `provider/SELECT`, `provider/DETECTED`, `provider/SET_CLI_SCOPE`, `provider/SELECT_CLI_SHELL` |
| tokenization | `tokenization.ts` | `tokenization/SELECT_LIB`, `tokenization/SET_ENCODER`, `tokenization/SET_CTX_LIMIT`, `tokenization/LIBS_LOADED`, `tokenization/ENCODERS_LOADED` |
| lifecycle | `lifecycle.ts` | `lifecycle/INITIALIZE`, `lifecycle/REFRESH` |

**Регистрация доменов** (`src/state/domains/index.ts`):
```typescript
export function getAllRules(): BusinessRule[] {
  const builtinRules = BUILTIN_DOMAINS.flatMap(d => d.rules);
  return [...builtinRules, ...additionalRules];
}

export function registerRules(rules: BusinessRule[]): void {
  additionalRules.push(...rules);
}
```

### 2.4. Provider Settings Modules

Провайдеры могут регистрировать собственные настройки через `ProviderSettingsModule`.

**Структура модуля настроек:**
```typescript
// src/services/ai/providers/claude-cli/settings.ts

export const claudeCliSettings: ProviderSettingsModule = {
  providerId: "com.anthropic.claude.cli",

  // Правила для команд этого провайдера
  rules: [selectModel, selectMethod],

  // Дефолты для providerSettings
  stateDefaults: {
    model: "sonnet",
    method: "continue"
  },

  // UI-вклад (динамические поля)
  buildContribution: (state) => ({
    providerId: "com.anthropic.claude.cli",
    title: "Claude Settings",
    visible: state.persistent.providerId === "com.anthropic.claude.cli",
    fields: [
      {
        id: "claudeModel",
        type: "select",
        label: "Model",
        options: [...],
        value: currentModel,
        command: { type: "provider.claude-cli/SELECT_MODEL", payloadKey: "model" }
      }
    ]
  })
};
```

**Namespace команд провайдеров:** `provider.<provider-id>/<ACTION>`
- `provider.claude-cli/SELECT_MODEL`
- `provider.claude-cli/SELECT_METHOD`
- `provider.codex-cli/SELECT_REASONING`

### 2.5. Watchers (`src/state/watchers/`)

Слушатели внешних событий, диспатчащие команды в Coordinator.

**FileWatcher** — следит за изменениями в `lg-cfg/`:
- Debounce 300ms для группировки событий
- Диспатчит `lifecycle/REFRESH` при изменениях

**ThemeWatcher** — следит за сменой темы VS Code

---

## 3. ViewModel Layer

### 3.1. buildViewModel (`src/viewmodel/builder.ts`)

**Чистая функция** без побочных эффектов: `PCEState → ViewModel`.

**Ответственности:**
- Извлечение текущих selections из персистентного состояния
- Построение массивов опций из конфигурации
- Сбор `ProviderSettingsContribution` от всех провайдеров
- Вычисление флагов видимости

**Динамические настройки провайдеров:**
```typescript
// Collect provider settings contributions
let providerSettings: ProviderSettingsContribution[] = [];
try {
  const aiService = getAiService();
  providerSettings = aiService.getAllSettingsModules()
    .map(module => module.buildContribution(state))
    .filter(contrib => contrib.visible);
} catch {
  // During bootstrap, aiService may not be available yet
}
```

### 3.2. ViewModel Types (`src/viewmodel/types.ts`)

**Динамические настройки провайдеров:**
```typescript
interface ProviderSettingsField {
  id: string;                    // DOM element id
  type: "select" | "text";
  label: string;
  options?: SelectOption[];
  value: string;
  command: {
    type: string;                // e.g., "provider.claude-cli/SELECT_MODEL"
    payloadKey: string;          // e.g., "model"
  };
}

interface ProviderSettingsContribution {
  providerId: string;
  title: string;
  visible: boolean;
  fields: ProviderSettingsField[];
}

interface ViewModel {
  // ... общие поля ...

  // Динамические настройки провайдеров
  providerSettings: ProviderSettingsContribution[];
}
```

---

## 4. Actions Layer

### 4.1. ActionDispatcher (`src/actions/index.ts`)

Синглтон, маршрутизирующий бизнес-операции к соответствующим модулям.

**Паттерн доступа:**
```typescript
import { getDispatcher } from "../bootstrap";
const dispatcher = getDispatcher();
await dispatcher.sendToAI();
```

### 4.2. Action Modules

**ListingActions:** `generateListing()`, `showIncluded()`, `showSectionStats()`

**ContextActions:** `generateContext()`, `showContextStats()`

**AiActions:** `sendToAI()`

**ToolbarActions:** `refreshCatalogs()`, `doctor()`, `resetCache()`, `updateAiModes()`

---

## 5. Views Layer

### 5.1. Принцип тонких представлений

Views отвечают только за:
1. Жизненный цикл WebView
2. Маршрутизацию сообщений к Coordinator/ActionDispatcher
3. Подписку на Store и передачу ViewModel в рендерер

### 5.2. ControlPanelView

**При resolveWebviewView:**
1. Подписывается на store → buildViewModel → postMessage
2. Запускает watchers
3. Диспатчит `lifecycle/INITIALIZE`

---

## 6. Render Layer (JavaScript)

### 6.1. Stateless Renderer (`media/control.js`)

WebView-рендерер без собственного состояния.

**Принцип работы:**
1. Получает ViewModel через `postMessage({ type: "render", viewModel })`
2. Сравнивает с предыдущим ViewModel (diff)
3. Обновляет только изменившиеся части DOM
4. Пользовательские события конвертирует в Commands с namespace
5. Отправляет Commands обратно через `postMessage`

**Динамический рендеринг настроек провайдеров:**
```javascript
function renderProviderSettings(vm, prev) {
  const container = DOM.qs("#provider-settings-container");
  const contributions = vm.providerSettings || [];

  // Rebuild if structure changed
  if (structureChanged) {
    container.innerHTML = buildProviderSettingsHtml(contributions);
  } else {
    // Just update values
    for (const contrib of contributions) {
      for (const field of contrib.fields) {
        const el = DOM.qs(`#${field.id}`);
        if (el) el.value = field.value;
      }
    }
  }
}
```

**Динамическая генерация команд:**
```javascript
// data-attributes на элементах указывают команду
<select data-command-type="provider.claude-cli/SELECT_MODEL"
        data-command-key="model">

// При изменении генерируется команда:
{ type: "provider.claude-cli/SELECT_MODEL", model: value }
```

---

## 7. Команды (Commands)

Все команды используют namespace формат: `domain/ACTION`

### Схема namespace

| Prefix | Описание | Пример |
|--------|----------|--------|
| `context/` | Работа с контекстами | `context/SELECT`, `context/SET_TASK` |
| `section/` | Работа с секциями | `section/SELECT`, `section/LOADED` |
| `adaptive/` | Режимы, теги, ветки | `adaptive/SELECT_MODE`, `adaptive/TOGGLE_TAG` |
| `provider/` | Общая логика провайдеров | `provider/SELECT`, `provider/DETECTED` |
| `provider.<id>/` | Настройки конкретного провайдера | `provider.claude-cli/SELECT_MODEL` |
| `tokenization/` | Токенизация | `tokenization/SELECT_LIB`, `tokenization/SET_ENCODER` |
| `lifecycle/` | Жизненный цикл | `lifecycle/INITIALIZE`, `lifecycle/REFRESH` |

### Каскад при инициализации

```
lifecycle/INITIALIZE
    ↓ async
provider/DETECTED → provider/SELECT
                         ↓ async
                    context/LOADED → context/SELECT
                                          ↓ async
                                     adaptive/MODE_SETS_LOADED
                                     adaptive/TAG_SETS_LOADED
```

---

## 8. Инициализация и жизненный цикл

### Порядок инициализации

1. `bootstrap(context)` в `extension.ts`:
   - Создание синглтонов (store, coordinator, services)
   - Регистрация правил от доменов: `coordinator.setRules(getAllRules())`
   - Регистрация правил от провайдеров: `registerRules(settings.rules)`

2. `resolveWebviewView()`:
   - Подписка на store → ViewModel → render
   - `watcherManager.startAll()`
   - `coordinator.dispatch({ type: "lifecycle/INITIALIZE" })`

3. Каскад async-операций загружает все данные

---

## 9. Расширение системы

### Добавление нового домена

1. Создать файл `src/state/domains/<domain>.ts`
2. Определить команды с namespace `<domain>/ACTION`
3. Реализовать правила
4. Экспортировать `DomainModule`
5. Добавить в `BUILTIN_DOMAINS` в `src/state/domains/index.ts`

```typescript
// src/state/domains/newdomain.ts
export interface MyCmd extends BaseCommand {
  type: "newdomain/MY_ACTION";
  payload: string;
}

const myRule: BusinessRule = {
  id: "newdomain/my-action",
  trigger: "newdomain/MY_ACTION",
  condition: () => true,
  apply: (state, cmd) => ({ mutations: { ... } })
};

export const newDomain: DomainModule = {
  id: "newdomain",
  rules: [myRule]
};
```

### Добавление нового AI-провайдера с настройками

1. Создать `src/services/ai/providers/<provider>/settings.ts`
2. Реализовать `ProviderSettingsModule`
3. Зарегистрировать в `src/services/ai/index.ts`

```typescript
// src/services/ai/providers/myprovider/settings.ts
export const myProviderSettings: ProviderSettingsModule = {
  providerId: "com.example.myprovider",
  rules: [...],
  stateDefaults: { option1: "default" },
  buildContribution: (state) => ({
    providerId: "com.example.myprovider",
    title: "My Provider Settings",
    visible: state.persistent.providerId === "com.example.myprovider",
    fields: [
      {
        id: "myOption",
        type: "select",
        label: "Option",
        options: [...],
        value: currentValue,
        command: { type: "provider.myprovider/SET_OPTION", payloadKey: "value" }
      }
    ]
  })
};

// src/services/ai/index.ts
import { myProviderSettings } from "./providers/myprovider/settings";
ALL_SETTINGS_MODULES.push(myProviderSettings);
```

UI появится автоматически — никаких изменений в `control.html` или `control.js` не требуется.

### Добавление нового Action

1. Создать функцию в `src/actions/<Module>Actions.ts`
2. Добавить метод в `ActionDispatcher`

### Добавление нового Watcher

1. Создать класс в `src/state/watchers/`
2. Добавить в `WatcherManager`
3. Вызывать `coordinator.dispatch()` при событиях
