# Control Panel State Management Architecture

## 1. Обзор проблемы

### 1.1. Текущие проблемы

Текущая архитектура `ControlPanelView` имеет критические недостатки:

1. **Смешение ответственностей** — бизнес-логика, управление состоянием и рендеринг переплетены в одном классе
2. **Разбросанные правила** — логика актуализации состояния размазана по методам `onProviderChanged`, `onContextChanged`, `pushListsAndState`
3. **Неявные зависимости** — непонятно, какие CLI-вызовы от чего зависят и в каком порядке должны выполняться
4. **Push/Pull смешение** — часть состояния push'ится в WebView, часть pull'ится обратно, что создаёт race conditions
5. **Отсутствие единой точки истины** — состояние дублируется между TypeScript и JavaScript

### 1.2. Требования к новой архитектуре

1. **Разделение слоёв** — чёткое разграничение бизнес-логики, состояния и рендеринга
2. **Декларативные правила** — бизнес-правила должны быть явно описаны и легко читаемы
3. **Предсказуемый data flow** — однонаправленный поток данных без race conditions
4. **Минимальный рендеринг** — UI обновляется только при изменении View Model
5. **Тестируемость** — каждый слой можно тестировать изолированно
6. **Полнота состояния в бизнес-слое** — все selections (provider, context, modes, etc.) всегда имеют явное значение, установленное бизнес-логикой. UI никогда не "угадывает" дефолты — он только отображает реальное состояние. Это гарантирует:
   - Пользователь видит действительное состояние, а не "выдуманное"
   - "Send to AI" работает с теми параметрами, которые видит пользователь
   - Очевидное поведение при автовыборе единственного варианта

---

## 2. Архитектура слоёв

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Provider Select │  │ Context Select  │  │ Mode-Sets / Tags Panels     │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           └────────────────────┼──────────────────────────┘                  │
│                                ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Render Layer                                     │ │
│  │  - Stateless rendering from ViewModel                                   │ │
│  │  - DOM diffing / minimal updates                                        │ │
│  │  - Event delegation → Commands                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                 ▲ ViewModel (read-only)
                                 │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ViewModel Builder                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  buildViewModel(pkoState) → ViewModel                                   │ │
│  │  - Pure function, no side effects                                       │ │
│  │  - All transformation rules in one place                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                 ▲ PKO State (immutable snapshot)
                                 │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         State Coordinator                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  processCommand(command) → void                                         │ │
│  │  - Orchestrates state updates                                           │ │
│  │  - Manages async CLI calls                                              │ │
│  │  - Applies business rules                                               │ │
│  │  - Emits new PKO state when stable                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Business Rules Engine                              │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │ Provider Rules  │  │ Context Rules   │  │ Mode/Tag Rules  │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                 ▲ Commands
                                 │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PKO State Store                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Persistent    │  │ Configuration   │  │  Environment    │              │
│  │     State       │  │     State       │  │     State       │              │
│  │                 │  │                 │  │                 │              │
│  │ - providerId    │  │ - contexts[]    │  │ - providers[]   │              │
│  │ - template      │  │ - sections[]    │  │                 │              │
│  │ - modes[c][p]   │  │ - modeSets[]    │  │                 │              │
│  │ - tags[c]       │  │ - tagSets[]     │  │                 │              │
│  │ - cliSettings   │  │ - branches[]    │  │                 │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│           ▲                    ▲                    ▲                        │
│           │                    │                    │                        │
│      Workspace             CLI calls            Detection                    │
│       Storage                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Детальное описание слоёв

### 3.1. PKO State Store

**Назначение:** Единая точка истины для всех типов состояния.

#### 3.1.1. Persistent State (P)

Состояние, сохраняемое между сессиями в `workspaceState`.

```typescript
interface PersistentState {
  // Selections
  providerId: string;
  template: string;                    // current context
  section: string;                     // for Inspect panel

  // Context-dependent selections
  modesByContextProvider: {
    [contextName: string]: {
      [providerId: string]: {
        [modeSetId: string]: string;   // selected modeId
      };
    };
  };
  tagsByContext: {
    [contextName: string]: {
      [tagSetId: string]: string[];    // selected tagIds
    };
  };

  // Tokenization
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;

  // CLI provider settings
  cliScope: string;
  cliShell: ShellType;
  claudeModel: ClaudeModel;
  claudeIntegrationMethod: ClaudeIntegrationMethod;
  codexReasoningEffort: CodexReasoningEffort;

  // Review mode
  targetBranch: string;

  // Task
  taskText: string;
}
```

#### 3.1.2. Configuration State (K)

Состояние, загружаемое из CLI (`list` commands).

```typescript
interface ConfigurationState {
  // Available options (from CLI)
  contexts: string[];                  // filtered by provider
  sections: string[];
  modeSets: ModeSetsList;              // filtered by context + provider
  tagSets: TagSetsList;                // filtered by context
  branches: string[];                  // from git

  // Tokenization options
  tokenizerLibs: string[];
  encoders: EncoderEntry[];            // filtered by tokenizerLib
}
```

#### 3.1.3. Environment State (O)

Состояние окружения, детектируемое при старте.

```typescript
interface EnvironmentState {
  // Available AI providers (detected)
  providers: ProviderInfo[];

  // Platform
  cliShells: ShellDescriptor[];
  claudeModels: ClaudeModelDescriptor[];
  claudeIntegrationMethods: ClaudeMethodDescriptor[];
  codexReasoningEfforts: CodexReasoningEffortDescriptor[];
}
```

#### 3.1.4. Combined PKO State

```typescript
interface PKOState {
  persistent: PersistentState;
  configuration: ConfigurationState;
  environment: EnvironmentState;

  // Meta
  isStable: boolean;                   // false while async ops pending
  pendingOps: Set<string>;             // tracking async operations
}
```

---

### 3.2. Commands

**Назначение:** Явное описание всех возможных изменений состояния.

```typescript
// User intent commands
type UserCommand =
  | { type: 'SELECT_PROVIDER'; providerId: string }
  | { type: 'SELECT_CONTEXT'; template: string }
  | { type: 'SELECT_SECTION'; section: string }
  | { type: 'SELECT_MODE'; modeSetId: string; modeId: string }
  | { type: 'TOGGLE_TAG'; tagSetId: string; tagId: string }
  | { type: 'SET_TASK_TEXT'; text: string }
  | { type: 'SELECT_TARGET_BRANCH'; branch: string }
  | { type: 'SELECT_TOKENIZER_LIB'; lib: string }
  | { type: 'SET_ENCODER'; encoder: string }
  | { type: 'SET_CTX_LIMIT'; limit: number }
  | { type: 'SET_CLI_SCOPE'; scope: string }
  | { type: 'SELECT_CLI_SHELL'; shell: ShellType }
  | { type: 'SELECT_CLAUDE_MODEL'; model: ClaudeModel }
  | { type: 'SELECT_CLAUDE_METHOD'; method: ClaudeIntegrationMethod }
  | { type: 'SELECT_CODEX_REASONING'; effort: CodexReasoningEffort };

// System commands (from CLI responses)
type SystemCommand =
  | { type: 'PROVIDERS_DETECTED'; providers: ProviderInfo[] }
  | { type: 'CONTEXTS_LOADED'; contexts: string[] }
  | { type: 'SECTIONS_LOADED'; sections: string[] }
  | { type: 'MODE_SETS_LOADED'; modeSets: ModeSetsList }
  | { type: 'TAG_SETS_LOADED'; tagSets: TagSetsList }
  | { type: 'ENCODERS_LOADED'; encoders: EncoderEntry[] }
  | { type: 'TOKENIZER_LIBS_LOADED'; libs: string[] }
  | { type: 'BRANCHES_LOADED'; branches: string[] };

// Lifecycle commands
type LifecycleCommand =
  | { type: 'INITIALIZE' }
  | { type: 'REFRESH' };

type Command = UserCommand | SystemCommand | LifecycleCommand;
```

---

### 3.3. Business Rules Engine

**Назначение:** Декларативное описание правил согласования состояния.

#### 3.3.1. Rule Structure

```typescript
/**
 * Typed business rule - trigger determines command type in callbacks
 * This eliminates redundant type checks in condition/apply
 */
interface BusinessRule<T extends Command['type'] = Command['type']> {
  /** Unique rule identifier for debugging */
  id: string;

  /** Human-readable description */
  description: string;

  /** Single command type that triggers this rule */
  trigger: T;

  /** Check if rule should be applied (command is already typed) */
  condition: (state: PKOState, cmd: Extract<Command, { type: T }>) => boolean;

  /** Apply rule: returns state mutations and/or follow-up commands */
  apply: (state: PKOState, cmd: Extract<Command, { type: T }>) => RuleResult;
}

interface RuleResult {
  /** State mutations to apply */
  mutations?: Partial<PersistentState>;

  /** Async operations to initiate */
  asyncOps?: AsyncOperation[];

  /** Follow-up commands to dispatch */
  followUp?: Command[];
}

interface AsyncOperation {
  id: string;
  execute: () => Promise<SystemCommand>;
}

/** Helper type to create typed rule */
type TypedRule<T extends Command['type']> = BusinessRule<T>;
```

#### 3.3.2. Core Business Rules

```typescript
const BUSINESS_RULES: BusinessRule[] = [
  // ============================================
  // RULE: Provider change triggers context reload
  // ============================================
  {
    id: 'provider-change-contexts',
    description: 'When provider changes, reload contexts filtered by new provider',
    trigger: 'SELECT_PROVIDER',
    condition: (state, cmd) => cmd.providerId !== state.persistent.providerId,
    apply: (state, cmd) => ({
      mutations: { providerId: cmd.providerId },
      asyncOps: [{
        id: 'load-contexts',
        execute: async () => {
          const contexts = await cliListContexts(cmd.providerId);
          return { type: 'CONTEXTS_LOADED', contexts };
        }
      }]
    })
  } satisfies TypedRule<'SELECT_PROVIDER'>,

  // ============================================
  // RULE: Contexts loaded - validate current selection
  // ============================================
  {
    id: 'contexts-validate-selection',
    description: 'When contexts are loaded, validate current template selection',
    trigger: 'CONTEXTS_LOADED',
    condition: () => true,
    apply: (state, cmd) => {
      const currentTemplate = state.persistent.template;
      const contexts = cmd.contexts;

      // If current template is valid, keep it
      if (currentTemplate && contexts.includes(currentTemplate)) {
        return {
          followUp: [{ type: 'SELECT_CONTEXT', template: currentTemplate }]
        };
      }

      // Otherwise, select first available
      const newTemplate = contexts[0] || '';
      return {
        mutations: { template: newTemplate },
        followUp: newTemplate
          ? [{ type: 'SELECT_CONTEXT', template: newTemplate }]
          : []
      };
    }
  } satisfies TypedRule<'CONTEXTS_LOADED'>,

  // ============================================
  // RULE: Context selection triggers mode-sets and tag-sets reload
  // ============================================
  {
    id: 'context-change-adaptive',
    description: 'When context is selected, reload mode-sets and tag-sets',
    trigger: 'SELECT_CONTEXT',
    // Always reload when context is selected (not just when changed)
    // because: 1) initial load, 2) provider change invalidates mode-sets
    condition: (state, cmd) => !!cmd.template,
    apply: (state, cmd) => ({
      mutations: { template: cmd.template },
      asyncOps: [
        {
          id: 'load-mode-sets',
          execute: async () => {
            const modeSets = await cliListModeSets(cmd.template, state.persistent.providerId);
            return { type: 'MODE_SETS_LOADED', modeSets };
          }
        },
        {
          id: 'load-tag-sets',
          execute: async () => {
            const tagSets = await cliListTagSets(cmd.template);
            return { type: 'TAG_SETS_LOADED', tagSets };
          }
        }
      ]
    })
  } satisfies TypedRule<'SELECT_CONTEXT'>,

  // ============================================
  // RULE: Mode-sets loaded - actualize saved modes
  // ============================================
  {
    id: 'mode-sets-actualize',
    description: 'When mode-sets are loaded, ensure all mode-sets have valid selection',
    trigger: 'MODE_SETS_LOADED',
    condition: () => true,
    apply: (state, cmd) => {
      const ctx = state.persistent.template;
      const provider = state.persistent.providerId;
      const savedModes = state.persistent.modesByContextProvider[ctx]?.[provider] || {};

      // Build complete modes object for ALL available mode-sets
      // This ensures UI always shows real state, not "guessed" defaults
      const actualizedModes: Record<string, string> = {};

      for (const modeSet of cmd.modeSets['mode-sets']) {
        const savedModeId = savedModes[modeSet.id];
        const modeExists = modeSet.modes.some(m => m.id === savedModeId);

        if (savedModeId && modeExists) {
          // Saved mode is valid - keep it
          actualizedModes[modeSet.id] = savedModeId;
        } else {
          // Saved mode is invalid or missing - select first available
          // This is explicit business decision, not UI fallback
          const defaultMode = modeSet.modes[0];
          if (defaultMode) {
            actualizedModes[modeSet.id] = defaultMode.id;
          }
        }
      }

      return {
        mutations: {
          modesByContextProvider: {
            ...state.persistent.modesByContextProvider,
            [ctx]: {
              ...state.persistent.modesByContextProvider[ctx],
              [provider]: actualizedModes
            }
          }
        }
      };
    }
  } satisfies TypedRule<'MODE_SETS_LOADED'>,

  // ============================================
  // RULE: Tag-sets loaded - actualize saved tags
  // ============================================
  {
    id: 'tag-sets-actualize',
    description: 'When tag-sets are loaded, remove invalid saved tags',
    trigger: 'TAG_SETS_LOADED',
    condition: () => true,
    apply: (state, cmd) => {
      const ctx = state.persistent.template;
      const savedTags = state.persistent.tagsByContext[ctx] || {};

      // Build set of valid (tagSetId, tagId) pairs
      const validPairs = new Map<string, Set<string>>();
      for (const tagSet of cmd.tagSets['tag-sets']) {
        validPairs.set(tagSet.id, new Set(tagSet.tags.map(t => t.id)));
      }

      // Validate saved tags
      const validatedTags: Record<string, string[]> = {};
      for (const [setId, tagIds] of Object.entries(savedTags)) {
        const validTagsInSet = validPairs.get(setId);
        if (!validTagsInSet) continue;

        const filteredTags = tagIds.filter(id => validTagsInSet.has(id));
        if (filteredTags.length > 0) {
          validatedTags[setId] = filteredTags;
        }
      }

      const hasChanges = JSON.stringify(savedTags) !== JSON.stringify(validatedTags);
      if (!hasChanges) return {};

      return {
        mutations: {
          tagsByContext: {
            ...state.persistent.tagsByContext,
            [ctx]: validatedTags
          }
        }
      };
    }
  } satisfies TypedRule<'TAG_SETS_LOADED'>,

  // ============================================
  // RULE: Tokenizer lib change triggers encoders reload
  // ============================================
  {
    id: 'tokenizer-lib-encoders',
    description: 'When tokenizer lib changes, reload encoders list',
    trigger: 'SELECT_TOKENIZER_LIB',
    condition: (state, cmd) => cmd.lib !== state.persistent.tokenizerLib,
    apply: (state, cmd) => ({
      mutations: { tokenizerLib: cmd.lib },
      asyncOps: [{
        id: 'load-encoders',
        execute: async () => {
          const encoders = await listEncodersJson(cmd.lib);
          return { type: 'ENCODERS_LOADED', encoders };
        }
      }]
    })
  } satisfies TypedRule<'SELECT_TOKENIZER_LIB'>,

  // ============================================
  // RULE: Mode selection - update persistent state
  // ============================================
  {
    id: 'mode-selection',
    description: 'When mode is selected, update persistent state',
    trigger: 'SELECT_MODE',
    condition: () => true,
    apply: (state, cmd) => {
      const ctx = state.persistent.template;
      const provider = state.persistent.providerId;

      return {
        mutations: {
          modesByContextProvider: {
            ...state.persistent.modesByContextProvider,
            [ctx]: {
              ...state.persistent.modesByContextProvider[ctx],
              [provider]: {
                ...state.persistent.modesByContextProvider[ctx]?.[provider],
                [cmd.modeSetId]: cmd.modeId
              }
            }
          }
        }
      };
    }
  } satisfies TypedRule<'SELECT_MODE'>,

  // ============================================
  // RULE: Initialize - full bootstrap
  // ============================================
  {
    id: 'initialize-bootstrap',
    description: 'On initialize, detect providers and load all catalogs',
    trigger: 'INITIALIZE',
    condition: () => true,
    apply: () => ({
      asyncOps: [
        {
          id: 'detect-providers',
          execute: async () => {
            const providers = await aiService.detectAvailableProviders();
            return { type: 'PROVIDERS_DETECTED', providers };
          }
        },
        {
          id: 'load-tokenizer-libs',
          execute: async () => {
            const libs = await listTokenizerLibsJson();
            return { type: 'TOKENIZER_LIBS_LOADED', libs };
          }
        },
        {
          id: 'load-sections',
          execute: async () => {
            const sections = await cliListSections();
            return { type: 'SECTIONS_LOADED', sections };
          }
        },
        {
          id: 'load-branches',
          execute: async () => {
            const branches = await gitService.getBranchNames();
            return { type: 'BRANCHES_LOADED', branches };
          }
        }
      ]
    })
  } satisfies TypedRule<'INITIALIZE'>,

  // ============================================
  // RULE: Providers detected - select best or restore saved
  // ============================================
  {
    id: 'providers-select-initial',
    description: 'When providers detected, select saved or best available',
    trigger: 'PROVIDERS_DETECTED',
    condition: () => true,
    apply: (state, cmd) => {
      const savedProvider = state.persistent.providerId;
      const providers = cmd.providers;

      // Check if saved provider is still available
      const savedExists = providers.some(p => p.id === savedProvider);
      const effectiveProvider = savedExists
        ? savedProvider
        : (providers[0]?.id || 'clipboard');

      return {
        followUp: [{ type: 'SELECT_PROVIDER', providerId: effectiveProvider }]
      };
    }
  } satisfies TypedRule<'PROVIDERS_DETECTED'>
];
```

---

### 3.4. State Coordinator

**Назначение:** Оркестрация обработки команд и управление асинхронными операциями.

```typescript
class StateCoordinator {
  private state: PKOState;
  private rules: BusinessRule[];
  private pendingOps = new Map<string, Promise<SystemCommand>>();

  // Two separate channels: stable state and UI meta
  private readonly onStateChange = new EventEmitter<PKOState>();
  private readonly onMetaChange = new EventEmitter<UIMeta>();

  constructor(
    initialState: PKOState,
    rules: BusinessRule[]
  ) {
    this.state = initialState;
    this.rules = rules;
  }

  /**
   * Process a command through the rules engine
   */
  async dispatch(command: Command): Promise<void> {
    // 1. Find applicable rules (typed command is passed to condition/apply)
    const applicableRules = this.rules.filter(rule =>
      rule.trigger === command.type &&
      rule.condition(this.state, command as any)
    );

    // 2. Apply rules and collect results
    const allMutations: Partial<PersistentState>[] = [];
    const allAsyncOps: AsyncOperation[] = [];
    const allFollowUps: Command[] = [];

    for (const rule of applicableRules) {
      const result = rule.apply(this.state, command as any);

      if (result.mutations) {
        allMutations.push(result.mutations);
      }
      if (result.asyncOps) {
        allAsyncOps.push(...result.asyncOps);
      }
      if (result.followUp) {
        allFollowUps.push(...result.followUp);
      }
    }

    // 3. Apply mutations synchronously
    if (allMutations.length > 0) {
      this.applyMutations(allMutations);
    }

    // 4. Start async operations
    for (const op of allAsyncOps) {
      this.startAsyncOp(op);
    }

    // 5. Update stability flag
    this.updateStability();

    // 6. Emit state if stable
    if (this.state.isStable) {
      this.onStateChange.emit(this.state);
    }

    // 7. Process follow-up commands
    for (const followUp of allFollowUps) {
      await this.dispatch(followUp);
    }
  }

  private applyMutations(mutations: Partial<PersistentState>[]): void {
    let newPersistent = { ...this.state.persistent };

    for (const mutation of mutations) {
      newPersistent = deepMerge(newPersistent, mutation);
    }

    this.state = {
      ...this.state,
      persistent: newPersistent
    };

    // Persist to workspace storage
    this.persistState(newPersistent);
  }

  private startAsyncOp(op: AsyncOperation): void {
    // Mark as pending
    this.state.pendingOps.add(op.id);
    this.updateStability();

    // Execute and handle result
    const promise = op.execute()
      .then(resultCommand => {
        this.state.pendingOps.delete(op.id);
        this.dispatch(resultCommand);
      })
      .catch(error => {
        this.state.pendingOps.delete(op.id);
        this.updateStability();
        console.error(`Async op ${op.id} failed:`, error);
      });

    this.pendingOps.set(op.id, promise);
  }

  private updateStability(): void {
    const wasStable = this.state.isStable;
    const isNowStable = this.state.pendingOps.size === 0;

    this.state = {
      ...this.state,
      isStable: isNowStable
    };

    // Emit meta change when loading state changes
    if (wasStable !== isNowStable) {
      this.onMetaChange.emit({ isLoading: !isNowStable });
    }
  }

  /**
   * Subscribe to stable state changes (for ViewModel building)
   */
  subscribe(callback: (state: PKOState) => void): () => void {
    return this.onStateChange.subscribe(callback);
  }

  /**
   * Subscribe to UI meta changes (loading state, errors)
   * Separate from state subscription - can fire more frequently
   */
  subscribeToMeta(callback: (meta: UIMeta) => void): () => void {
    return this.onMetaChange.subscribe(callback);
  }
}
```

---

### 3.5. ViewModel Builder

**Назначение:** Трансформация PKO-состояния в модель представления (чистая функция).

```typescript
interface ViewModel {
  // Provider selector
  providers: SelectOption[];
  selectedProviderId: string;

  // Context selector
  contexts: SelectOption[];
  selectedContextId: string;

  // Section selector (Inspect panel)
  sections: SelectOption[];
  selectedSectionId: string;

  // Mode-sets panels
  modeSets: ModeSetViewModel[];

  // Tags panel
  tagSets: TagSetViewModel[];
  tagsPanelVisible: boolean;
  selectedTagsCount: number;

  // Target branch (visible only in review mode)
  targetBranchVisible: boolean;
  branches: SelectOption[];
  selectedBranch: string;

  // Tokenization settings
  tokenizerLibs: SelectOption[];
  selectedTokenizerLib: string;
  encoders: EncoderOption[];
  selectedEncoder: string;
  ctxLimit: number;

  // CLI settings (visible only for CLI providers)
  cliSettingsVisible: boolean;
  cliScope: string;
  cliShells: SelectOption[];
  selectedShell: string;

  // Claude-specific (visible only for Claude CLI)
  claudeSettingsVisible: boolean;
  claudeModels: SelectOption[];
  selectedClaudeModel: string;
  claudeMethods: SelectOption[];
  selectedClaudeMethod: string;

  // Codex-specific (visible only for Codex CLI)
  codexSettingsVisible: boolean;
  codexReasoningEfforts: SelectOption[];
  selectedCodexReasoning: string;

  // Task text
  taskText: string;
}

/**
 * UI Meta State - delivered through separate channel
 * Not part of ViewModel to avoid violating "stable state only" principle
 */
interface UIMeta {
  isLoading: boolean;
  // Future: error messages, notifications, etc.
}

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface EncoderOption extends SelectOption {
  cached: boolean;
}

interface ModeSetViewModel {
  id: string;
  title: string;
  modes: ModeOption[];
  selectedModeId: string;
}

interface ModeOption {
  id: string;
  title: string;
  description?: string;
}

interface TagSetViewModel {
  id: string;
  title: string;
  expanded: boolean;
  tags: TagOption[];
}

interface TagOption {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
}

/**
 * Pure function: PKO State → ViewModel
 */
function buildViewModel(state: PKOState): ViewModel {
  const { persistent: p, configuration: c, environment: e } = state;

  // Current context and provider for lookups
  const ctx = p.template;
  const provider = p.providerId;

  // Get current modes for this context+provider
  const currentModes = p.modesByContextProvider[ctx]?.[provider] || {};

  // Get current tags for this context
  const currentTags = p.tagsByContext[ctx] || {};

  // Check if review mode is active
  const isReviewMode = Object.values(currentModes).includes('review');

  // Check if CLI provider
  const isCliProvider = provider.endsWith('.cli');
  const isClaudeCli = provider === 'com.anthropic.claude.cli';
  const isCodexCli = provider === 'com.openai.codex.cli';

  // Build mode-sets view models
  // Note: selectedModeId is always present - business layer guarantees it
  const modeSets: ModeSetViewModel[] = c.modeSets['mode-sets'].map(ms => ({
    id: ms.id,
    title: ms.title,
    modes: ms.modes.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description
    })),
    selectedModeId: currentModes[ms.id]  // Always defined by business rules
  }));

  // Build tag-sets view models (exclude 'global')
  const tagSets: TagSetViewModel[] = c.tagSets['tag-sets']
    .filter(ts => ts.id !== 'global')
    .map(ts => {
      const selectedInSet = currentTags[ts.id] || [];
      return {
        id: ts.id,
        title: ts.title,
        expanded: selectedInSet.length > 0,
        tags: ts.tags.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          checked: selectedInSet.includes(t.id)
        }))
      };
    });

  // Count total selected tags
  const selectedTagsCount = Object.values(currentTags)
    .reduce((sum, tags) => sum + tags.length, 0);

  return {
    // Providers
    providers: e.providers.map(p => ({ value: p.id, label: p.name })),
    selectedProviderId: provider,

    // Contexts
    contexts: c.contexts.map(name => ({ value: name, label: name })),
    selectedContextId: ctx,

    // Sections
    sections: c.sections.map(name => ({ value: name, label: name })),
    selectedSectionId: p.section,

    // Mode-sets
    modeSets,

    // Tags
    tagSets,
    tagsPanelVisible: false, // controlled by UI
    selectedTagsCount,

    // Target branch
    targetBranchVisible: isReviewMode && c.branches.length > 0,
    branches: c.branches.map(b => ({ value: b, label: b })),
    selectedBranch: p.targetBranch,

    // Tokenization
    tokenizerLibs: c.tokenizerLibs.map(lib => ({ value: lib, label: lib })),
    selectedTokenizerLib: p.tokenizerLib,
    encoders: c.encoders.map(e => ({
      value: e.name,
      label: e.name,
      cached: e.cached ?? false
    })),
    selectedEncoder: p.encoder,
    ctxLimit: p.ctxLimit,

    // CLI settings
    cliSettingsVisible: isCliProvider,
    cliScope: p.cliScope,
    cliShells: e.cliShells.map(s => ({ value: s.id, label: s.label })),
    selectedShell: p.cliShell,

    // Claude
    claudeSettingsVisible: isClaudeCli,
    claudeModels: e.claudeModels.map(m => ({
      value: m.id,
      label: m.label,
      description: m.description
    })),
    selectedClaudeModel: p.claudeModel,
    claudeMethods: e.claudeIntegrationMethods.map(m => ({
      value: m.id,
      label: m.label,
      description: m.description
    })),
    selectedClaudeMethod: p.claudeIntegrationMethod,

    // Codex
    codexSettingsVisible: isCodexCli,
    codexReasoningEfforts: e.codexReasoningEfforts.map(r => ({
      value: r.id,
      label: r.label,
      description: r.description
    })),
    selectedCodexReasoning: p.codexReasoningEffort,

    // Task
    taskText: p.taskText
  };
}
```

---

### 3.6. Render Layer

**Назначение:** Stateless рендеринг UI по ViewModel с минимальным DOM-манипулированием.

**Технология:** Чистый JavaScript с использованием утилит из `media/ui/utils/` (LGUI).
TypeScript-типы в этом разделе приводятся только для документации контракта.

#### 3.6.1. Renderer Contract (TypeScript для документации)

```typescript
// Контракт рендерера - реализация на JavaScript
interface Renderer {
  /** Render ViewModel to DOM (diff-based, called only when state is stable) */
  render(viewModel: ViewModel): void;

  /** Update UI meta state (loading indicator) - separate lightweight channel */
  setMeta(meta: UIMeta): void;

  /** Subscribe to user events, returns Command */
  onCommand(callback: (command: UserCommand) => void): void;
}
```

#### 3.6.2. JavaScript Implementation with LGUI

Рендерер реализуется в `media/control.js` и использует утилиты из `media/ui/`:

- **`DOM.qs/qsa`** — querySelector shortcuts
- **`DOM.applyFormState`** — batch-применение значений к form controls
- **`Events.delegate`** — делегирование событий
- **`Events.debounce`** — дебаунс для text inputs
- **`LGUI.fillSelect`** — заполнение select с опциями

```javascript
/* media/control.js */
(function () {
  const { DOM, Events } = LGUI;

  // ========== State ==========
  let lastViewModel = null;
  let commandCallback = null;

  // ========== Renderer API ==========

  /**
   * Main render function - called when ViewModel changes
   * Uses diff to minimize DOM updates
   * @param {ViewModel} vm
   */
  function render(vm) {
    const prev = lastViewModel;
    lastViewModel = vm;

    // Diff-based updates for each section
    renderProviders(vm, prev);
    renderContexts(vm, prev);
    renderSections(vm, prev);
    renderModeSets(vm, prev);
    renderTagSets(vm, prev);
    renderTargetBranch(vm, prev);
    renderTokenization(vm, prev);
    renderCliSettings(vm, prev);
    renderTask(vm, prev);
  }

  /**
   * Update UI meta state (loading overlay)
   * Lightweight - no diffing needed
   * @param {UIMeta} meta
   */
  function setMeta(meta) {
    const overlay = DOM.qs("#loading-overlay");
    if (overlay) {
      overlay.style.display = meta.isLoading ? "flex" : "none";
    }
  }

  /**
   * Subscribe to user commands
   * @param {(cmd: UserCommand) => void} callback
   */
  function onCommand(callback) {
    commandCallback = callback;
  }

  // ========== Section Renderers ==========

  function renderProviders(vm, prev) {
    if (prev && arraysEqual(prev.providers, vm.providers) &&
        prev.selectedProviderId === vm.selectedProviderId) {
      return;
    }

    const select = DOM.qs("#provider");
    if (!select) return;

    // Update options only if list changed
    if (!prev || !arraysEqual(prev.providers, vm.providers)) {
      LGUI.fillSelect(select, vm.providers, {
        getValue: (p) => p.value,
        getLabel: (p) => p.label
      });
    }

    // Update selection
    if (select.value !== vm.selectedProviderId) {
      select.value = vm.selectedProviderId;
    }
  }

  function renderContexts(vm, prev) {
    if (prev && arraysEqual(prev.contexts, vm.contexts) &&
        prev.selectedContextId === vm.selectedContextId) {
      return;
    }

    const select = DOM.qs("#template");
    if (!select) return;

    if (!prev || !arraysEqual(prev.contexts, vm.contexts)) {
      LGUI.fillSelect(select, vm.contexts, {
        getValue: (c) => c.value,
        getLabel: (c) => c.label
      });
    }

    if (select.value !== vm.selectedContextId) {
      select.value = vm.selectedContextId;
    }
  }

  function renderSections(vm, prev) {
    if (prev && arraysEqual(prev.sections, vm.sections) &&
        prev.selectedSectionId === vm.selectedSectionId) {
      return;
    }

    const select = DOM.qs("#section");
    if (!select) return;

    if (!prev || !arraysEqual(prev.sections, vm.sections)) {
      LGUI.fillSelect(select, vm.sections, {
        getValue: (s) => s.value,
        getLabel: (s) => s.label
      });
    }

    if (select.value !== vm.selectedSectionId) {
      select.value = vm.selectedSectionId;
    }
  }

  function renderModeSets(vm, prev) {
    const container = DOM.qs("#mode-sets-row");
    if (!container) return;

    // Check if structure changed (different mode-sets or different modes within)
    const structureChanged = !prev || !modeSetsStructureEqual(prev.modeSets, vm.modeSets);

    if (structureChanged) {
      // Full rebuild
      container.innerHTML = buildModeSetsHtml(vm.modeSets);
    } else {
      // Just update selections
      vm.modeSets.forEach((ms) => {
        const select = DOM.qs(`#mode-${ms.id}`, container);
        if (select && select.value !== ms.selectedModeId) {
          select.value = ms.selectedModeId;
        }
      });
    }
  }

  function renderTagSets(vm, prev) {
    const container = DOM.qs("#tag-sets-container");
    if (!container) return;

    // Check if structure changed
    const structureChanged = !prev || !tagSetsStructureEqual(prev.tagSets, vm.tagSets);

    if (structureChanged) {
      container.innerHTML = buildTagSetsHtml(vm.tagSets);
    } else {
      // Just update checked state
      vm.tagSets.forEach((ts) => {
        ts.tags.forEach((tag) => {
          const checkbox = DOM.qs(`#tag-${ts.id}--${tag.id}`, container);
          if (checkbox && checkbox.checked !== tag.checked) {
            checkbox.checked = tag.checked;
          }
        });
      });
    }

    // Update button text with count
    const btn = DOM.qs("#tags-toggle .btn-text");
    if (btn) {
      btn.textContent = vm.selectedTagsCount > 0
        ? `Configure Tags (${vm.selectedTagsCount})`
        : "Configure Tags";
    }
  }

  function renderTargetBranch(vm, prev) {
    const cluster = DOM.qs("#target-branch-cluster");

    // Handle visibility
    if (!vm.targetBranchVisible) {
      if (cluster) cluster.remove();
      return;
    }

    // Create if doesn't exist
    if (!cluster) {
      const container = DOM.qs("#mode-sets-row");
      if (container) {
        container.insertAdjacentHTML("beforeend", buildTargetBranchHtml(vm));
      }
      return;
    }

    // Update options and selection
    const select = DOM.qs("#targetBranch", cluster);
    if (!select) return;

    if (!prev || !arraysEqual(prev.branches, vm.branches)) {
      LGUI.fillSelect(select, vm.branches, {
        getValue: (b) => b.value,
        getLabel: (b) => b.label
      });
    }

    if (select.value !== vm.selectedBranch) {
      select.value = vm.selectedBranch;
    }
  }

  function renderTokenization(vm, prev) {
    // Tokenizer lib
    const libSelect = DOM.qs("#tokenizerLib");
    if (libSelect) {
      if (!prev || !arraysEqual(prev.tokenizerLibs, vm.tokenizerLibs)) {
        LGUI.fillSelect(libSelect, vm.tokenizerLibs, {
          getValue: (l) => l.value,
          getLabel: (l) => l.label
        });
      }
      if (libSelect.value !== vm.selectedTokenizerLib) {
        libSelect.value = vm.selectedTokenizerLib;
      }
    }

    // Encoder (uses autosuggest, just update value)
    const encoderInput = DOM.qs("#encoder");
    if (encoderInput && encoderInput.value !== vm.selectedEncoder) {
      encoderInput.value = vm.selectedEncoder;
    }

    // Context limit
    const ctxLimitInput = DOM.qs("#ctxLimit");
    if (ctxLimitInput && ctxLimitInput.value !== String(vm.ctxLimit)) {
      ctxLimitInput.value = String(vm.ctxLimit);
    }
  }

  function renderCliSettings(vm, prev) {
    const block = DOM.qs("#cli-settings-block");
    if (!block) return;

    // Visibility
    block.style.display = vm.cliSettingsVisible ? "flex" : "none";
    if (!vm.cliSettingsVisible) return;

    // CLI Scope
    const scopeInput = DOM.qs("#cliScope");
    if (scopeInput && scopeInput.value !== vm.cliScope) {
      scopeInput.value = vm.cliScope;
    }

    // Shell
    const shellSelect = DOM.qs("#cliShell");
    if (shellSelect && shellSelect.value !== vm.selectedShell) {
      shellSelect.value = vm.selectedShell;
    }

    // Claude settings
    const claudeContainer = DOM.qs("#claude-settings-container");
    if (claudeContainer) {
      claudeContainer.style.display = vm.claudeSettingsVisible ? "flex" : "none";

      if (vm.claudeSettingsVisible) {
        const modelSelect = DOM.qs("#claudeModel");
        if (modelSelect && modelSelect.value !== vm.selectedClaudeModel) {
          modelSelect.value = vm.selectedClaudeModel;
        }

        const methodSelect = DOM.qs("#claudeIntegrationMethod");
        if (methodSelect && methodSelect.value !== vm.selectedClaudeMethod) {
          methodSelect.value = vm.selectedClaudeMethod;
        }
      }
    }

    // Codex settings
    const codexContainer = DOM.qs("#codex-settings-container");
    if (codexContainer) {
      codexContainer.style.display = vm.codexSettingsVisible ? "flex" : "none";

      if (vm.codexSettingsVisible) {
        const reasoningSelect = DOM.qs("#codexReasoningEffort");
        if (reasoningSelect && reasoningSelect.value !== vm.selectedCodexReasoning) {
          reasoningSelect.value = vm.selectedCodexReasoning;
        }
      }
    }
  }

  function renderTask(vm, prev) {
    const textarea = DOM.qs("#taskText");
    if (textarea && textarea.value !== vm.taskText) {
      textarea.value = vm.taskText;
    }
  }

  // ========== HTML Builders ==========

  function buildModeSetsHtml(modeSets) {
    return modeSets.map((ms) => `
      <span class="cluster">
        <label>${ms.title}:</label>
        <select id="mode-${ms.id}" data-mode-set="${ms.id}" class="lg-select mode-select">
          ${ms.modes.map((m) => `
            <option value="${m.id}" ${m.id === ms.selectedModeId ? "selected" : ""}
                    ${m.description ? `title="${m.description}"` : ""}>
              ${m.title}
            </option>
          `).join("")}
        </select>
      </span>
    `).join("");
  }

  function buildTagSetsHtml(tagSets) {
    return tagSets.map((ts) => `
      <div class="tag-set ${ts.expanded ? "expanded" : ""}">
        <div class="tag-set-header">
          <span class="codicon codicon-chevron-right tag-set-chevron"></span>
          <span class="tag-set-title">${ts.title}</span>
        </div>
        <div class="tag-set-tags">
          ${ts.tags.map((tag) => `
            <div class="tag-item">
              <input type="checkbox" id="tag-${ts.id}--${tag.id}"
                     data-tag-set="${ts.id}" data-tag="${tag.id}"
                     ${tag.checked ? "checked" : ""}>
              <label class="tag-item-label" for="tag-${ts.id}--${tag.id}">
                ${tag.title}
              </label>
              ${tag.description ? `<div class="tag-item-description">${tag.description}</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function buildTargetBranchHtml(vm) {
    return `
      <span id="target-branch-cluster" class="cluster">
        <label>Target Branch:</label>
        <select id="targetBranch" class="lg-select">
          ${vm.branches.map((b) => `
            <option value="${b.value}" ${b.value === vm.selectedBranch ? "selected" : ""}>
              ${b.label}
            </option>
          `).join("")}
        </select>
      </span>
    `;
  }

  // ========== Diff Helpers ==========

  function arraysEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => {
      if (typeof item === "object") {
        return JSON.stringify(item) === JSON.stringify(b[i]);
      }
      return item === b[i];
    });
  }

  function modeSetsStructureEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((msA, i) => {
      const msB = b[i];
      return msA.id === msB.id &&
             msA.modes.length === msB.modes.length &&
             msA.modes.every((mA, j) => mA.id === msB.modes[j].id);
    });
  }

  function tagSetsStructureEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((tsA, i) => {
      const tsB = b[i];
      return tsA.id === tsB.id &&
             tsA.tags.length === tsB.tags.length &&
             tsA.tags.every((tA, j) => tA.id === tsB.tags[j].id);
    });
  }

  // ========== Event Handling ==========

  function setupEventDelegation() {
    // Select changes → immediate command
    Events.delegate(document, "select", "change", (el) => {
      const cmd = selectToCommand(el);
      if (cmd && commandCallback) {
        commandCallback(cmd);
      }
    });

    // Checkbox changes → immediate command
    Events.delegate(document, "input[type=checkbox]", "change", (el) => {
      const cmd = checkboxToCommand(el);
      if (cmd && commandCallback) {
        commandCallback(cmd);
      }
    });

    // Text input → debounced command
    Events.delegate(document, "textarea, input[type=text], input[type=number]", "input",
      Events.debounce((el) => {
        const cmd = inputToCommand(el);
        if (cmd && commandCallback) {
          commandCallback(cmd);
        }
      }, 300)
    );

    // Tag set header click → toggle expand (local UI, no command)
    Events.delegate(document, ".tag-set-header", "click", (el) => {
      const tagSet = el.closest(".tag-set");
      if (tagSet) {
        tagSet.classList.toggle("expanded");
      }
    });
  }

  function selectToCommand(el) {
    const id = el.id;
    const value = el.value;

    switch (id) {
      case "provider":
        return { type: "SELECT_PROVIDER", providerId: value };
      case "template":
        return { type: "SELECT_CONTEXT", template: value };
      case "section":
        return { type: "SELECT_SECTION", section: value };
      case "targetBranch":
        return { type: "SELECT_TARGET_BRANCH", branch: value };
      case "tokenizerLib":
        return { type: "SELECT_TOKENIZER_LIB", lib: value };
      case "cliShell":
        return { type: "SELECT_CLI_SHELL", shell: value };
      case "claudeModel":
        return { type: "SELECT_CLAUDE_MODEL", model: value };
      case "claudeIntegrationMethod":
        return { type: "SELECT_CLAUDE_METHOD", method: value };
      case "codexReasoningEffort":
        return { type: "SELECT_CODEX_REASONING", effort: value };
      default:
        // Mode select
        if (id.startsWith("mode-")) {
          const modeSetId = el.dataset.modeSet;
          return { type: "SELECT_MODE", modeSetId, modeId: value };
        }
        return null;
    }
  }

  function checkboxToCommand(el) {
    const tagSetId = el.dataset.tagSet;
    const tagId = el.dataset.tag;
    if (tagSetId && tagId) {
      return { type: "TOGGLE_TAG", tagSetId, tagId };
    }
    return null;
  }

  function inputToCommand(el) {
    const id = el.id;
    const value = el.value;

    switch (id) {
      case "taskText":
        return { type: "SET_TASK_TEXT", text: value };
      case "encoder":
        return { type: "SET_ENCODER", encoder: value };
      case "ctxLimit":
        return { type: "SET_CTX_LIMIT", limit: parseInt(value, 10) || 0 };
      case "cliScope":
        return { type: "SET_CLI_SCOPE", scope: value };
      default:
        return null;
    }
  }

  // ========== Initialization ==========

  setupEventDelegation();

  // Export renderer API for TypeScript orchestration layer
  window.ControlPanelRenderer = { render, setMeta, onCommand };
})();
```

---

## 4. Data Flow

### 4.1. Initialization Flow

```
1. Extension activates
   │
2. StateCoordinator.dispatch({ type: 'INITIALIZE' })
   │
3. Rule 'initialize-bootstrap' triggers:
   │  - async: detectProviders
   │  - async: loadTokenizerLibs
   │  - async: loadSections
   │  - async: loadBranches
   │
4. [Async] PROVIDERS_DETECTED received
   │  Rule 'providers-select-initial':
   │  - validates saved providerId
   │  - dispatches SELECT_PROVIDER
   │
5. [Cascade] SELECT_PROVIDER processed
   │  Rule 'provider-change-contexts':
   │  - async: loadContexts(providerId)
   │
6. [Async] CONTEXTS_LOADED received
   │  Rule 'contexts-validate-selection':
   │  - validates saved template
   │  - dispatches SELECT_CONTEXT
   │
7. [Cascade] SELECT_CONTEXT processed
   │  Rule 'context-change-adaptive':
   │  - async: loadModeSets(ctx, provider)
   │  - async: loadTagSets(ctx)
   │
8. [Async] MODE_SETS_LOADED received
   │  Rule 'mode-sets-actualize':
   │  - validates saved modes
   │
9. [Async] TAG_SETS_LOADED received
   │  Rule 'tag-sets-actualize':
   │  - validates saved tags
   │
10. All async ops complete → state.isStable = true
    │
11. StateCoordinator emits stable PKO state
    │
12. ViewModel built from PKO state
    │
13. Renderer updates UI
```

### 4.2. User Interaction Flow

```
1. User selects new provider in dropdown
   │
2. Renderer captures 'change' event
   │
3. eventToCommand() → { type: 'SELECT_PROVIDER', providerId: 'new-id' }
   │
4. StateCoordinator.dispatch(command)
   │
5. Rules process command (see Business Rules)
   │
6. Async ops complete → state becomes stable
   │
7. New ViewModel built
   │
8. Renderer diffs and updates only changed parts of UI
```

---

## 5. Файловая структура

```
src/
├── state/
│   ├── types.ts              # PKOState, ViewModel, Command types
│   ├── store.ts              # PKOStateStore class
│   ├── coordinator.ts        # StateCoordinator class
│   └── rules/
│       ├── index.ts          # All rules exported
│       ├── provider.rules.ts # Provider-related rules
│       ├── context.rules.ts  # Context-related rules
│       ├── adaptive.rules.ts # Mode-sets/tag-sets rules
│       └── tokenizer.rules.ts # Tokenization rules
│
├── viewmodel/
│   ├── types.ts              # ViewModel interface
│   ├── builder.ts            # buildViewModel() pure function
│   └── helpers.ts            # Transformation helpers
│
└── views/
    └── ControlPanelView.ts   # Thin orchestration layer (WebView host)

media/
├── control.js                # Renderer implementation (JavaScript)
├── control.css               # Styles
├── control.html              # HTML template
└── ui/
    ├── utils/
    │   ├── dom.js            # DOM utilities (qs, qsa, applyFormState, etc.)
    │   └── events.js         # Event utilities (delegate, debounce, etc.)
    └── dist/
        └── lg-ui.js          # Bundled LGUI (DOM, Events, State, etc.)
```

### 5.1. Multi-View Support

`PKOStateStore` используется не только в `ControlPanelView`, но и в других views
(например, `StatsWebview`). Архитектура учитывает это:

```
                    ┌─────────────────────┐
                    │   PKOStateStore     │  ← Singleton, shared state
                    │   (src/state/)      │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────────┐ ┌──────────────┐ ┌────────────────┐
    │ StateCoordinator│ │ StatsWebview │ │ Future Views   │
    │ (ControlPanel)  │ │ (read/write) │ │ (read/write)   │
    └────────┬────────┘ └──────────────┘ └────────────────┘
             │
             ▼
    ┌─────────────────┐
    │    Renderer     │
    │ (control.js)    │
    └─────────────────┘
```

**Паттерн доступа:**

1. **ControlPanelView** — полная State Machine через `StateCoordinator`
   - Dispatches commands
   - Receives ViewModel updates
   - Full business rules

2. **StatsWebview и другие** — Direct Store Access
   - `store.getState()` — чтение состояния
   - `store.dispatch({ type: 'SET_TASK_TEXT', text })` — простые обновления
   - `store.subscribe(listener)` — подписка на изменения (опционально)

**Простой API для вторичных views:**

```typescript
// В StatsWebview.ts
import { getPKOStore } from '../state/store';

const store = getPKOStore(context);

// Чтение
const { taskText, providerId } = store.getState();

// Обновление (через стандартный dispatch)
store.dispatch({ type: 'SET_TASK_TEXT', text: newTaskText });

// Query methods (вычисляемые значения)
const runs = store.getIntegrationModeRuns(contextName, providerId, modeSets);
```

**Принцип:** StateCoordinator с бизнес-правилами нужен только для views со сложной
интерактивностью. Простые views могут работать напрямую со store.

---

## 6. Миграция

### 6.1. Что удаляется

1. `ControlStateService.ts` — заменяется на `PKOStateStore` (удаляется после Phase 7)
2. Вся бизнес-логика из `ControlPanelView.ts` — переносится в `rules/`
3. State management в `control.js` — рендерер становится stateless

### 6.2. Что сохраняется

1. CLI-клиент (`CliClient.ts`, `CatalogService.ts`) — используется из async ops
2. AI Integration (`AiIntegrationService.ts`) — используется для detection
3. HTML-структура (`control.html`) — обновляется рендерером

### 6.3. План миграции

1. **Phase 1:** Создать типы и интерфейсы (`src/state/types.ts`, `src/viewmodel/types.ts`)
2. **Phase 2:** Реализовать `PKOStateStore` и `StateCoordinator`
3. **Phase 3:** Перенести бизнес-правила в `src/state/rules/`
4. **Phase 4:** Реализовать `buildViewModel()` в `src/viewmodel/builder.ts`
5. **Phase 5:** Переписать `media/control.js` как stateless рендерер с LGUI
6. **Phase 6:** Обновить `ControlPanelView` как тонкий оркестрационный слой
7. **Phase 7:** Мигрировать вторичные views (`StatsWebview` и др.) на direct store access

---

## 7. Преимущества новой архитектуры

1. **Предсказуемость** — однонаправленный поток данных, явные команды
2. **Тестируемость** — каждый слой тестируется изолированно:
   - Rules: unit tests с mock state
   - ViewModel builder: snapshot tests
   - Renderer: DOM assertions
3. **Отладка** — все правила явно названы и логируемы
4. **Расширяемость** — новые правила добавляются декларативно
5. **Производительность** — минимальные DOM-обновления через diff
6. **Понятность** — чёткое разделение "что" (rules) от "как" (render)
