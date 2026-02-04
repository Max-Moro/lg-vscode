# Архитектура State Management для Control Panel

Данный документ описывает внутреннюю реализацию подсистемы управления состоянием
Control Panel в VS Code Extension. Документ предназначен для разработчиков,
работающих над этой подсистемой.

---

## 1. Обзор архитектуры

Подсистема реализует однонаправленный поток данных (unidirectional data flow):

```
User Action → Renderer → Command → Coordinator → Rules → Store → ViewModel → Render
```

### Ключевые принципы

1. **Единая точка истины** — всё бизнес-состояние хранится в `PCEStateStore`
2. **Декларативные правила** — логика переходов описана в доменных модулях
3. **Namespace-команды** — все команды имеют формат `domain/ACTION`
4. **Модульность** — домены и провайдеры самодостаточны
5. **Тонкие представления** — Views отвечают только за рендеринг
6. **Разделение слоёв** — универсальный движок (`state-engine`) отделён от бизнес-логики (`state-lg`)

### Файловая структура

```
src/
├── state-engine/             # Универсальный движок координации состояния
│   ├── types.ts              # BaseCommand, RuleResult, BusinessRule, StateStore
│   ├── command.ts            # command(), createRuleFactory(), RuleRegistry
│   ├── coordinator.ts        # StateCoordinator<TState, TResult>
│   └── index.ts              # Публичный API движка
│
├── state-lg/                 # Бизнес-логика LG Extension
│   ├── types.ts              # PCEState, PersistentState, ConfigurationState, EnvironmentState
│   ├── store.ts              # PCEStateStore, LGRuleResult
│   ├── coordinator.ts        # createLGCoordinator(), LGStateCoordinator
│   ├── rule.ts               # rule() — фабрика правил для LG
│   └── domains/              # Доменные модули (бизнес-правила)
│       ├── index.ts          # Side-effect импорты для регистрации
│       ├── context.ts        # context/* команды
│       ├── section.ts        # section/* команды
│       ├── adaptive.ts       # adaptive/* команды
│       ├── provider.ts       # provider/* команды
│       ├── tokenization.ts   # tokenization/* команды
│       └── lifecycle.ts      # lifecycle/* команды
│
├── services/ai/providers/    # AI Provider Layer
│   ├── claude-cli/
│   │   └── settings.ts       # provider.claude-cli/* команды
│   ├── codex-cli/
│   │   └── settings.ts       # provider.codex-cli/* команды
│   └── ...
│
├── viewmodel/                # ViewModel Layer
│   ├── types.ts              # ViewModel + ProviderSettingsContribution
│   └── builder.ts            # Чистая функция buildViewModel()
│
├── actions/                  # Actions Layer
│   ├── index.ts              # Re-exports
│   ├── GenerationActions.ts
│   ├── StatsActions.ts
│   ├── AiActions.ts
│   └── ToolbarActions.ts
│
└── views/                    # Views Layer (тонкие)
    ├── ControlPanelView.ts
    └── StatsWebview.ts
```

---

## 2. State Engine Layer (`src/state-engine/`)

Универсальный движок координации состояния. Не знает о бизнес-логике LG Extension.
Может быть переиспользован в других проектах.

### 2.1. Базовые типы (`types.ts`)

```typescript
// Базовый результат правила — только координационные поля
interface RuleResult {
  asyncOps?: AsyncOperation[];
  followUp?: BaseCommand[];
}

// Бизнес-правило — generic по состоянию и результату
interface BusinessRule<TState, TResult extends RuleResult = RuleResult> {
  trigger: string;
  condition: (state: TState, cmd: BaseCommand) => boolean;
  apply: (state: TState, cmd: BaseCommand) => TResult;
}

// Интерфейс хранилища — generic по состоянию и результату
interface StateStore<TState, TResult extends RuleResult = RuleResult> {
  getState(): TState;
  applyMutations(result: TResult): Promise<void>;
  emit(): void;
  subscribe(listener: StateListener<TState>): () => void;
}
```

**Важно:** `RuleResult` не содержит поля `mutations` — это деталь реализации конкретного store.
Движок не знает как применять мутации к состоянию.

### 2.2. Фабрики команд и правил (`command.ts`)

```typescript
// Фабрика команд
const SelectContext = command("context/SELECT").payload<{ template: string }>();
const Initialize = command("lifecycle/INITIALIZE").noPayload();

// Реестр правил — generic по состоянию и результату
class RuleRegistry<TState, TResult extends RuleResult> {
  register(rule: BusinessRule<TState, TResult>): void;
  getAll(): BusinessRule<TState, TResult>[];
}

// Фабрика rule() — создаётся через createRuleFactory
const rule = createRuleFactory(registry);
```

### 2.3. StateCoordinator (`coordinator.ts`)

Оркестрирует обработку команд. Управляет стабильностью внутри себя.

```typescript
class StateCoordinator<TState, TResult extends RuleResult> {
  private pendingOps = 0;  // Координационное состояние — внутри координатора

  constructor(store: StateStore<TState, TResult>, logger?: CoordinatorLogger);
  setRules(rules: BusinessRule<TState, TResult>[]): void;
  dispatch(command: BaseCommand): Promise<void>;
  isStable(): boolean;
  subscribeToMeta(listener: MetaListener): () => void;
}
```

**Жизненный цикл команды:**
1. `dispatch(command)` — приём команды
2. Поиск правил по `trigger === command.type`
3. Проверка `condition(state, cmd)` для каждого правила
4. Вызов `apply(state, cmd)` → получение результата
5. Вызов `store.applyMutations(result)` — store сам решает как применить
6. Запуск async-операций (их результат — новые команды)
7. Обработка follow-up команд
8. Эмиссия состояния при достижении стабильности

---

## 3. State LG Layer (`src/state-lg/`)

Бизнес-логика LG Extension. Использует движок из `state-engine`.

### 3.1. LGRuleResult и PCEState (`types.ts`, `store.ts`)

```typescript
// LG-специфичный результат — расширяет базовый
interface LGRuleResult extends RuleResult {
  mutations?: Partial<PersistentState>;      // Мутации персистентного состояния
  configMutations?: Partial<ConfigurationState>;  // Мутации конфигурации
  envMutations?: Partial<EnvironmentState>;       // Мутации окружения
}

// PCE = Persistent + Configuration + Environment (только бизнес-данные)
interface PCEState {
  persistent: PersistentState;
  configuration: ConfigurationState;
  environment: EnvironmentState;
  // НЕТ isStable, pendingOps — это внутри координатора
}
```

### 3.2. PCEStateStore (`store.ts`)

Реализует `StateStore<PCEState, LGRuleResult>`.

```typescript
class PCEStateStore implements StateStore<PCEState, LGRuleResult> {
  // Применяет мутации из LGRuleResult
  async applyMutations(result: LGRuleResult): Promise<void> {
    if (result.mutations) await this.updatePersistent(result.mutations);
    if (result.configMutations) this.updateConfiguration(result.configMutations);
    if (result.envMutations) this.updateEnvironment(result.envMutations);
  }
}
```

**Паттерн доступа:**
```typescript
import { getStore } from "../bootstrap";
const store = getStore();
```

### 3.3. Rule Factory (`rule.ts`)

Использует `createRuleFactory` из движка:

```typescript
import { createRuleFactory, RuleRegistry } from "../state-engine";

const lgRuleRegistry = new RuleRegistry<PCEState, LGRuleResult>();
export const rule = createRuleFactory(lgRuleRegistry);
export const getAllRules = () => lgRuleRegistry.getAll();
```

### 3.4. Coordinator Factory (`coordinator.ts`)

```typescript
export type LGStateCoordinator = StateCoordinator<PCEState, LGRuleResult>;

export function createLGCoordinator(store: PCEStateStore): LGStateCoordinator {
  const coordinator = new StateCoordinator<PCEState, LGRuleResult>(store, lgLogger);
  coordinator.setRules(getAllRules());  // Автоматическая регистрация правил
  return coordinator;
}
```

**Паттерн доступа:**
```typescript
import { getCoordinator } from "../bootstrap";
const coordinator = getCoordinator();
await coordinator.dispatch({ type: "provider/SELECT", providerId: "..." });
```

### 3.5. Domain Modules (`domains/`)

Каждый домен — самодостаточный модуль:

```typescript
// src/state-lg/domains/context.ts
import { command } from "../../state-engine";
import { rule } from "../rule";
import type { PCEState } from "../types";

// Команды
export const SelectContext = command("context/SELECT").payload<{ template: string }>();

// Правила — авто-регистрация при импорте модуля
rule(SelectContext, {
  condition: (state, cmd) => cmd.template !== state.persistent.template,
  apply: (state, cmd) => ({
    mutations: { template: cmd.template },
    asyncOps: [...]
  })
});
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

**Регистрация доменов** (`domains/index.ts`):

```typescript
// Side-effect импорты для регистрации правил
import "./context";
import "./section";
import "./adaptive";
import "./provider";
import "./tokenization";
import "./lifecycle";
```

### 3.6. Provider Settings Modules

Провайдеры регистрируют настройки через `ProviderSettingsModule`:

```typescript
// src/services/ai/providers/claude-cli/settings.ts
import { command } from "../../../../state-engine";
import { rule } from "../../../../state-lg/rule";

export const SelectClaudeModel = command("provider.claude-cli/SELECT_MODEL")
  .payload<{ model: ClaudeModel }>();

rule(SelectClaudeModel, {
  condition: () => true,
  apply: (state, cmd) => ({
    mutations: { providerSettings: updateClaudeSettings(state, { model: cmd.model }) }
  })
});
```

---

## 4. ViewModel Layer

### 4.1. buildViewModel (`src/viewmodel/builder.ts`)

**Чистая функция** без побочных эффектов: `PCEState → ViewModel`.

**Ответственности:**
- Извлечение текущих selections из персистентного состояния
- Построение массивов опций из конфигурации
- Сбор `ProviderSettingsContribution` от всех провайдеров
- Вычисление флагов видимости

---

## 5. Actions Layer

Статические модули со статическими методами для выполнения бизнес-операций:

- **GenerationActions:** `generateListing()`, `generateContext()`
- **StatsActions:** `showSectionStats()`, `showContextStats()`, `showIncluded()`
- **AiActions:** `sendToAI()`
- **ToolbarActions:** `refreshCatalogs()`, `doctor()`, `resetCache()`, `updateAiModes()`

```typescript
import { AiActions } from "../actions";
await AiActions.sendToAI();
```

---

## 6. Views Layer

Views отвечают только за:
1. Жизненный цикл WebView
2. Маршрутизацию сообщений к Coordinator и Action-модулям
3. Подписку на Store и передачу ViewModel в рендерер

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
   - Создание синглтонов (store, services)
   - `createLGCoordinator(store)` — автоматически регистрирует правила

2. `resolveWebviewView()`:
   - Подписка на store → ViewModel → render
   - `coordinator.dispatch(Initialize.create())`

3. Каскад async-операций загружает все данные

---

## 9. Расширение системы

### Добавление нового домена

1. Создать файл `src/state-lg/domains/<domain>.ts`
2. Определить команды через `command()` из `state-engine`
3. Определить правила через `rule()` из `state-lg`
4. Добавить импорт в `src/state-lg/domains/index.ts`

```typescript
// src/state-lg/domains/newdomain.ts
import { command } from "../../state-engine";
import { rule } from "../rule";
import type { PCEState } from "../types";

export const MyAction = command("newdomain/MY_ACTION").payload<{ value: string }>();

rule(MyAction, {
  condition: () => true,
  apply: (state, cmd) => ({
    mutations: { myField: cmd.value }
  })
});
```

```typescript
// src/state-lg/domains/index.ts
import "./newdomain";  // добавить импорт для регистрации
```

### Добавление нового AI-провайдера с настройками

1. Создать `src/services/ai/providers/<provider>/settings.ts`
2. Определить команды через `command()` из `state-engine`
3. Определить правила через `rule()` из `state-lg`
4. Реализовать `ProviderSettingsModule`
5. Зарегистрировать в `src/services/ai/index.ts`

```typescript
// src/services/ai/providers/myprovider/settings.ts
import { command } from "../../../../state-engine";
import { rule } from "../../../../state-lg/rule";

export const SetOption = command("provider.myprovider/SET_OPTION").payload<{ value: string }>();

rule(SetOption, {
  condition: () => true,
  apply: (state, cmd) => ({
    mutations: { providerSettings: { ...state.persistent.providerSettings, myprovider: { option: cmd.value } } }
  })
});

export const myProviderSettings: ProviderSettingsModule = {
  providerId: "com.example.myprovider",
  stateDefaults: { option: "default" },
  buildContribution: (state) => ({ ... })
};
```
