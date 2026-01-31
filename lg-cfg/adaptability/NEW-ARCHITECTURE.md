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
interface BusinessRule {
  /** Unique rule identifier for debugging */
  id: string;

  /** Human-readable description */
  description: string;

  /** Commands that trigger this rule */
  triggers: Command['type'][];

  /** Check if rule should be applied */
  condition: (state: PKOState, command: Command) => boolean;

  /** Apply rule: returns state mutations and/or follow-up commands */
  apply: (state: PKOState, command: Command) => RuleResult;
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
    triggers: ['SELECT_PROVIDER'],
    condition: (state, cmd) => {
      if (cmd.type !== 'SELECT_PROVIDER') return false;
      return cmd.providerId !== state.persistent.providerId;
    },
    apply: (state, cmd) => {
      if (cmd.type !== 'SELECT_PROVIDER') return {};
      return {
        mutations: { providerId: cmd.providerId },
        asyncOps: [{
          id: 'load-contexts',
          execute: async () => {
            const contexts = await cliListContexts(cmd.providerId);
            return { type: 'CONTEXTS_LOADED', contexts };
          }
        }]
      };
    }
  },

  // ============================================
  // RULE: Contexts loaded - validate current selection
  // ============================================
  {
    id: 'contexts-validate-selection',
    description: 'When contexts are loaded, validate current template selection',
    triggers: ['CONTEXTS_LOADED'],
    condition: () => true,
    apply: (state, cmd) => {
      if (cmd.type !== 'CONTEXTS_LOADED') return {};

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
  },

  // ============================================
  // RULE: Context selection triggers mode-sets and tag-sets reload
  // ============================================
  {
    id: 'context-change-adaptive',
    description: 'When context is selected, reload mode-sets and tag-sets',
    triggers: ['SELECT_CONTEXT'],
    condition: (state, cmd) => {
      if (cmd.type !== 'SELECT_CONTEXT') return false;
      // Always reload when context is selected (not just when changed)
      // because: 1) initial load, 2) provider change invalidates mode-sets
      return !!cmd.template;
    },
    apply: (state, cmd) => {
      if (cmd.type !== 'SELECT_CONTEXT') return {};

      const providerId = state.persistent.providerId;
      const template = cmd.template;

      return {
        mutations: { template },
        asyncOps: [
          {
            id: 'load-mode-sets',
            execute: async () => {
              const modeSets = await cliListModeSets(template, providerId);
              return { type: 'MODE_SETS_LOADED', modeSets };
            }
          },
          {
            id: 'load-tag-sets',
            execute: async () => {
              const tagSets = await cliListTagSets(template);
              return { type: 'TAG_SETS_LOADED', tagSets };
            }
          }
        ]
      };
    }
  },

  // ============================================
  // RULE: Mode-sets loaded - actualize saved modes
  // ============================================
  {
    id: 'mode-sets-actualize',
    description: 'When mode-sets are loaded, ensure all mode-sets have valid selection',
    triggers: ['MODE_SETS_LOADED'],
    condition: () => true,
    apply: (state, cmd) => {
      if (cmd.type !== 'MODE_SETS_LOADED') return {};

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
  },

  // ============================================
  // RULE: Tag-sets loaded - actualize saved tags
  // ============================================
  {
    id: 'tag-sets-actualize',
    description: 'When tag-sets are loaded, remove invalid saved tags',
    triggers: ['TAG_SETS_LOADED'],
    condition: () => true,
    apply: (state, cmd) => {
      if (cmd.type !== 'TAG_SETS_LOADED') return {};

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
  },

  // ============================================
  // RULE: Tokenizer lib change triggers encoders reload
  // ============================================
  {
    id: 'tokenizer-lib-encoders',
    description: 'When tokenizer lib changes, reload encoders list',
    triggers: ['SELECT_TOKENIZER_LIB'],
    condition: (state, cmd) => {
      if (cmd.type !== 'SELECT_TOKENIZER_LIB') return false;
      return cmd.lib !== state.persistent.tokenizerLib;
    },
    apply: (state, cmd) => {
      if (cmd.type !== 'SELECT_TOKENIZER_LIB') return {};
      return {
        mutations: { tokenizerLib: cmd.lib },
        asyncOps: [{
          id: 'load-encoders',
          execute: async () => {
            const encoders = await listEncodersJson(cmd.lib);
            return { type: 'ENCODERS_LOADED', encoders };
          }
        }]
      };
    }
  },

  // ============================================
  // RULE: Check review mode for target branch visibility
  // ============================================
  {
    id: 'review-mode-branch',
    description: 'When mode changes to review, ensure branches are loaded',
    triggers: ['SELECT_MODE'],
    condition: (state, cmd) => {
      if (cmd.type !== 'SELECT_MODE') return false;
      return cmd.modeId === 'review';
    },
    apply: (state, cmd) => {
      if (cmd.type !== 'SELECT_MODE') return {};

      // Branches should already be loaded, just update mode
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
  },

  // ============================================
  // RULE: Initialize - full bootstrap
  // ============================================
  {
    id: 'initialize-bootstrap',
    description: 'On initialize, detect providers and load all catalogs',
    triggers: ['INITIALIZE'],
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
  },

  // ============================================
  // RULE: Providers detected - select best or restore saved
  // ============================================
  {
    id: 'providers-select-initial',
    description: 'When providers detected, select saved or best available',
    triggers: ['PROVIDERS_DETECTED'],
    condition: () => true,
    apply: (state, cmd) => {
      if (cmd.type !== 'PROVIDERS_DETECTED') return {};

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
  }
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

  private readonly onStateChange = new EventEmitter<PKOState>();

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
    // 1. Find applicable rules
    const applicableRules = this.rules.filter(rule =>
      rule.triggers.includes(command.type) &&
      rule.condition(this.state, command)
    );

    // 2. Apply rules and collect results
    const allMutations: Partial<PersistentState>[] = [];
    const allAsyncOps: AsyncOperation[] = [];
    const allFollowUps: Command[] = [];

    for (const rule of applicableRules) {
      const result = rule.apply(this.state, command);

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
    this.state = {
      ...this.state,
      isStable: this.state.pendingOps.size === 0
    };
  }

  /**
   * Subscribe to stable state changes
   */
  subscribe(callback: (state: PKOState) => void): () => void {
    return this.onStateChange.subscribe(callback);
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

  // Loading state
  isLoading: boolean;
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
    taskText: p.taskText,

    // Loading
    isLoading: !state.isStable
  };
}
```

---

### 3.6. Render Layer

**Назначение:** Stateless рендеринг UI по ViewModel с минимальным DOM-манипулированием.

#### 3.6.1. Renderer Interface

```typescript
interface Renderer {
  /**
   * Render ViewModel to DOM
   * Uses diff-based approach to minimize DOM updates
   */
  render(viewModel: ViewModel): void;

  /**
   * Subscribe to user events
   * Returns Command based on user action
   */
  onCommand(callback: (command: UserCommand) => void): void;
}
```

#### 3.6.2. Implementation Strategy

```typescript
class ControlPanelRenderer implements Renderer {
  private lastViewModel: ViewModel | null = null;
  private commandCallback: ((cmd: UserCommand) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.setupEventDelegation();
  }

  render(vm: ViewModel): void {
    const prev = this.lastViewModel;
    this.lastViewModel = vm;

    // Diff-based updates for each section
    this.renderProviders(vm, prev);
    this.renderContexts(vm, prev);
    this.renderModeSets(vm, prev);
    this.renderTagSets(vm, prev);
    this.renderTargetBranch(vm, prev);
    this.renderTokenization(vm, prev);
    this.renderCliSettings(vm, prev);
    this.renderTask(vm, prev);
    this.renderLoadingState(vm, prev);
  }

  private renderProviders(vm: ViewModel, prev: ViewModel | null): void {
    // Skip if unchanged
    if (prev &&
        arraysEqual(prev.providers, vm.providers) &&
        prev.selectedProviderId === vm.selectedProviderId) {
      return;
    }

    const select = this.root.querySelector('#provider') as HTMLSelectElement;
    if (!select) return;

    // Update options if changed
    if (!prev || !arraysEqual(prev.providers, vm.providers)) {
      select.innerHTML = vm.providers
        .map(p => `<option value="${p.value}">${p.label}</option>`)
        .join('');
    }

    // Update selection
    if (select.value !== vm.selectedProviderId) {
      select.value = vm.selectedProviderId;
    }
  }

  private renderModeSets(vm: ViewModel, prev: ViewModel | null): void {
    const container = this.root.querySelector('#mode-sets-row');
    if (!container) return;

    // Check if mode-sets structure changed
    const structureChanged = !prev ||
      !modeSetsStructureEqual(prev.modeSets, vm.modeSets);

    if (structureChanged) {
      // Full rebuild needed
      container.innerHTML = this.buildModeSetsHtml(vm.modeSets);
    } else {
      // Just update selections
      for (const ms of vm.modeSets) {
        const select = container.querySelector(`#mode-${ms.id}`) as HTMLSelectElement;
        if (select && select.value !== ms.selectedModeId) {
          select.value = ms.selectedModeId;
        }
      }
    }

    // Update target branch visibility
    this.updateTargetBranchVisibility(vm);
  }

  private setupEventDelegation(): void {
    // Single event listener for all interactive elements
    this.root.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      const command = this.eventToCommand(target);
      if (command && this.commandCallback) {
        this.commandCallback(command);
      }
    });

    this.root.addEventListener('input', debounce((e: Event) => {
      const target = e.target as HTMLElement;
      const command = this.eventToCommand(target);
      if (command && this.commandCallback) {
        this.commandCallback(command);
      }
    }, 300));
  }

  private eventToCommand(target: HTMLElement): UserCommand | null {
    const id = target.id;

    if (id === 'provider') {
      return { type: 'SELECT_PROVIDER', providerId: (target as HTMLSelectElement).value };
    }
    if (id === 'template') {
      return { type: 'SELECT_CONTEXT', template: (target as HTMLSelectElement).value };
    }
    if (id === 'section') {
      return { type: 'SELECT_SECTION', section: (target as HTMLSelectElement).value };
    }
    if (id.startsWith('mode-')) {
      const modeSetId = target.dataset.modeSet!;
      return { type: 'SELECT_MODE', modeSetId, modeId: (target as HTMLSelectElement).value };
    }
    if (id.startsWith('tag-')) {
      const [tagSetId, tagId] = this.parseTagId(id);
      return { type: 'TOGGLE_TAG', tagSetId, tagId };
    }
    if (id === 'taskText') {
      return { type: 'SET_TASK_TEXT', text: (target as HTMLTextAreaElement).value };
    }
    if (id === 'targetBranch') {
      return { type: 'SELECT_TARGET_BRANCH', branch: (target as HTMLSelectElement).value };
    }
    // ... other mappings

    return null;
  }

  onCommand(callback: (command: UserCommand) => void): void {
    this.commandCallback = callback;
  }
}
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
├── render/
│   ├── renderer.ts           # ControlPanelRenderer class
│   ├── diff.ts               # DOM diffing utilities
│   └── templates.ts          # HTML generation helpers
│
└── views/
    └── ControlPanelView.ts   # Thin orchestration layer
```

---

## 6. Миграция

### 6.1. Что удаляется

1. `ControlStateService.ts` — заменяется на `PKOStateStore` + `StateCoordinator`
2. Вся бизнес-логика из `ControlPanelView.ts` — переносится в `rules/`
3. State management в `control.js` — рендерер становится stateless

### 6.2. Что сохраняется

1. CLI-клиент (`CliClient.ts`, `CatalogService.ts`) — используется из async ops
2. AI Integration (`AiIntegrationService.ts`) — используется для detection
3. HTML-структура (`control.html`) — обновляется рендерером

### 6.3. План миграции

1. **Phase 1:** Создать новые типы и интерфейсы (`state/types.ts`, `viewmodel/types.ts`)
2. **Phase 2:** Реализовать `PKOStateStore` и `StateCoordinator`
3. **Phase 3:** Перенести бизнес-правила в `rules/`
4. **Phase 4:** Реализовать `buildViewModel()`
5. **Phase 5:** Создать `ControlPanelRenderer`
6. **Phase 6:** Обновить `ControlPanelView` как тонкий оркестрационный слой
7. **Phase 7:** Обновить `control.js` как stateless рендерер

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
