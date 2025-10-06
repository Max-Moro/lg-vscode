# ТЗ: Task Context Field — VS Code Extension UI

## Обзор

Добавление UI-компонента "Task Context Field" в Control Panel и Stats Webview для ввода финальных инструкций, которые передаются в CLI через аргумент `--task`.

## Цель

Предоставить удобный интерфейс для быстрого добавления описания текущей задачи к генерируемым контекстам без необходимости ручного редактирования файлов.

---

## 1. UI Components

### 1.1 Control Panel — Task Context Field

**Расположение:** В самом верху блока "AI Contexts", над Template selector и кнопками.

**Визуальная структура:**

```
┌─ AI Contexts ────────────────────────────────────┐
│ ┌─ Task Context ──────────────────────────────┐  │
│ │ [Многострочное текстовое поле (textarea)]   │  │
│ │ [Placeholder: "Describe current task..."]   │  │
│ │ [Auto-resize: 2-10 строк]                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ Template: [Dropdown ▼]                            │
│ [Send to AI] [Generate Context] [Show Stats]     │
└───────────────────────────────────────────────────┘
```

**HTML структура (control.html):**

```html
<div class="block">
  <h3><span class="codicon codicon-run"></span>AI Contexts</h3>
  
  <!-- NEW: Task Context Field -->
  <div class="row">
    <div class="cluster" style="flex-direction: column; align-items: stretch;">
      <label class="muted">Task Context:</label>
      <textarea 
        id="task-context"
        data-state-key="taskContext"
        placeholder="Describe current task..."
        rows="2"
        style="resize: vertical; min-height: 3em; max-height: 15em;"
      ></textarea>
    </div>
  </div>
  
  <!-- Existing controls -->
  <div class="row">
    <span class="cluster">
      <select id="template" class="grow" data-state-key="template"></select>
      <button data-action="sendContextToAI">
        <span class="codicon codicon-send"></span><span class="btn-text">Send to AI</span>
      </button>
      <button id="btn-context" data-action="generateContext">
        <span class="codicon codicon-file-code"></span><span class="btn-text">Generate Context</span>
      </button>
    </span>
    <!-- ... -->
  </div>
</div>
```

**CSS стили (control.css):**

```css
/* Task context textarea */
#task-context {
  width: 100%;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
  border-radius: 4px;
  padding: 6px;
  resize: vertical;
  min-height: 3em;
  max-height: 15em;
}

#task-context:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

#task-context::placeholder {
  color: var(--vscode-input-placeholderForeground);
  opacity: 0.6;
}
```

### 1.2 Stats Webview — Task Context Field

**Расположение:** В верхней части stats UI, над сводкой и таблицей файлов.

**Визуальная структура:**

```
┌─ Statistics ─────────────────────────────────────┐
│ ┌─ Task Context ──────────────────────────────┐  │
│ │ [Многострочное текстовое поле (textarea)]   │  │
│ │ [Синхронизировано с Control Panel]          │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ [Summary cards...]                                │
│ [Files table...]                                  │
│ [Refresh] [Regenerate] [Send to AI]               │
└───────────────────────────────────────────────────┘
```

**HTML добавить в stats.html:**

```html
<!-- NEW: Task Context Field (синхронизировано с Control Panel) -->
<div style="margin-bottom: 16px;">
  <label class="muted" style="display: block; margin-bottom: 4px;">
    Task Context:
  </label>
  <textarea 
    id="task-context-stats"
    placeholder="Describe current task..."
    rows="2"
    style="width: 100%; resize: vertical; min-height: 3em; max-height: 15em;
           font-family: var(--vscode-editor-font-family, monospace);
           font-size: 12px;
           background: var(--vscode-input-background);
           color: var(--vscode-input-foreground);
           border: 1px solid var(--vscode-input-border);
           border-radius: 4px;
           padding: 6px;"
  ></textarea>
</div>
```

---

## 2. State Management

### 2.1 Workspace State Schema

Расширить `PanelState` в `ControlPanelView.ts`:

```typescript
type PanelState = {
  section: string;
  template: string;
  model: string;
  modes: Record<string, string>;
  tags: string[];
  taskContext: string;  // <-- NEW FIELD
};

const DEFAULT_STATE: PanelState = {
  section: "all-src",
  template: "",
  model: "o3",
  modes: {},
  tags: [],
  taskContext: ""  // <-- DEFAULT EMPTY
};
```

### 2.2 Persistence

**Где хранить:** `workspaceState` под ключом `"lg.control.state"`

**Когда сохранять:**
- При каждом изменении textarea (debounce 500ms)
- При переключении template (на случай разных task для разных шаблонов)
- При закрытии webview

**Когда восстанавливать:**
- При инициализации Control Panel
- При открытии Stats Webview

### 2.3 Синхронизация между webviews

**Protocol Messages:**

```typescript
// Control Panel → Extension Host
{ type: "updateTaskContext", taskContext: string }

// Extension Host → Stats Webview
{ type: "taskContextSync", taskContext: string }

// Stats Webview → Extension Host
{ type: "updateTaskContext", taskContext: string }

// Extension Host → Control Panel
{ type: "taskContextSync", taskContext: string }
```

**Реализация:**

```typescript
// В ControlPanelView.ts
view.webview.onDidReceiveMessage(async (msg) => {
  switch (msg.type) {
    case "updateTaskContext":
      this.setState({ taskContext: msg.taskContext });
      // Синхронизировать с открытыми Stats webviews
      this.syncTaskContextToStats(msg.taskContext);
      break;
    // ...
  }
});

// В StatsWebview (при открытии)
function initStatsWebview(initialTaskContext: string) {
  const textarea = document.getElementById("task-context-stats");
  if (textarea) {
    textarea.value = initialTaskContext;
    textarea.addEventListener("input", debounce((e) => {
      vscode.postMessage({ 
        type: "updateTaskContext", 
        taskContext: e.target.value 
      });
    }, 500));
  }
  
  // Listen for sync messages
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "taskContextSync") {
      textarea.value = msg.taskContext;
    }
  });
}
```

---

## 3. CLI Integration

### 3.1 Передача task в CLI

Обновить `CliClient.ts`:

```typescript
export interface CliOptions {
  model?: string;
  modes?: Record<string, string>;
  tags?: string[];
  task?: string;  // <-- NEW FIELD
}

export async function cliRender(
  target: string, 
  options: CliOptions = {}
): Promise<string> {
  const args: string[] = ["render", target];
  
  if (options.model) {
    args.push("--model", options.model);
  }
  
  if (options.modes) {
    for (const [modeset, mode] of Object.entries(options.modes)) {
      if (mode) {
        args.push("--mode", `${modeset}:${mode}`);
      }
    }
  }
  
  if (options.tags && options.tags.length > 0) {
    args.push("--tags", options.tags.join(","));
  }
  
  // NEW: Add task if provided
  if (options.task && options.task.trim()) {
    args.push("--task", options.task.trim());
  }
  
  return runCli(args, { timeoutMs: 120_000 });
}

export async function cliReport(
  target: string, 
  options: CliOptions = {}
): Promise<RunResult> {
  // Same logic for --task argument
  // ...
}
```

### 3.2 Обновление сервисов

**ContextService.ts:**

```typescript
export interface ContextParams {
  template: string;
  model?: string;
  modes?: Record<string, string>;
  tags?: string[];
  task?: string;  // <-- NEW FIELD
}

export async function runContext(
  templateName: string, 
  options: CliOptions = {}
): Promise<string> {
  const target = `ctx:${templateName}`;
  return cliRender(target, options);
}

export async function runContextStatsJson(
  params: ContextParams
): Promise<RunResult> {
  const target = `ctx:${params.template}`;
  const options: CliOptions = {
    model: params.model ?? "o3",
    modes: params.modes,
    tags: params.tags,
    task: params.task  // <-- PASS TASK
  };
  return cliReport(target, options);
}
```

**ListingService.ts:**

```typescript
export interface ListingParams {
  section?: string;
  model?: string;
  modes?: Record<string, string>;
  tags?: string[];
  task?: string;  // <-- NEW FIELD
}

// Обновить runListing и runListIncludedJson аналогично
```

### 3.3 Обновление handlers в ControlPanelView

```typescript
private async onGenerateContext() {
  const s = this.getState();
  if (!s.template) {
    vscode.window.showWarningMessage("Select a template first.");
    return;
  }
  const options = {
    model: s.model,
    task: s.taskContext,  // <-- PASS TASK
    ...this.getAdaptiveParams(s)
  };
  const content = await vscode.window.withProgress(
    { 
      location: vscode.ProgressLocation.Notification, 
      title: `LG: Generating context '${s.template}'…`, 
      cancellable: false 
    },
    () => runContext(s.template, options)
  );
  await this.vdocs.open("context", `Context — ${s.template}.md`, content);
}

private async onSendContextToAI() {
  const s = this.getState();
  if (!s.template) {
    vscode.window.showWarningMessage("Select a template first.");
    return;
  }
  const options = {
    model: s.model,
    task: s.taskContext,  // <-- PASS TASK
    ...this.getAdaptiveParams(s)
  };
  const content = await vscode.window.withProgress(
    { 
      location: vscode.ProgressLocation.Notification, 
      title: `LG: Generating context '${s.template}' for AI…`, 
      cancellable: false 
    },
    () => runContext(s.template, options)
  );
  await this.aiService.sendContext(s.template, content);
}

// Аналогично для onShowContextStats, onGenerateListing, onSendListingToAI, onShowStats
```

---

## 4. UX Details

### 4.1 Auto-resize Behavior

```javascript
// В control.js и stats.js
function setupAutoResize(textarea) {
  const adjust = () => {
    textarea.style.height = "auto";
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, 3 * 16),  // min 3em
      15 * 16  // max 15em
    );
    textarea.style.height = newHeight + "px";
  };
  
  textarea.addEventListener("input", adjust);
  // Initial adjustment
  adjust();
}

// Применить к #task-context при init
const taskTextarea = document.getElementById("task-context");
if (taskTextarea) {
  setupAutoResize(taskTextarea);
}
```

### 4.2 Debounce для сохранения

```javascript
// В control.js
const taskTextarea = document.getElementById("task-context");
if (taskTextarea) {
  taskTextarea.addEventListener("input", UI.debounce((e) => {
    const value = e.target.value;
    const patch = { taskContext: value };
    store.merge(patch);
    UI.post(vscode, "updateTaskContext", { taskContext: value });
  }, 500));
}
```

### 4.3 Keyboard Shortcuts (опционально, P2)

```typescript
// В extension.ts или отдельном keyboard handler
context.subscriptions.push(
  vscode.commands.registerCommand("lg.focusTaskContext", () => {
    // Программно фокусироваться на textarea в webview
    // (требует postMessage в webview)
  })
);

// Можно биндить на Ctrl+Shift+T или другой shortcut
```

---

## 5. Edge Cases & Error Handling

### 5.1 Пустой Task Context

**Поведение:**
- Если textarea пустой → не передавать `--task` в CLI
- CLI обработает отсутствие аргумента корректно (пустая подстановка в `${task}`)

### 5.2 Длинный текст

**Ограничения:**
- Визуальный лимит: textarea max-height 15em (скролл)
- Технический лимит: максимум 10,000 символов (валидация перед отправкой)

```typescript
private validateTaskContext(task: string): string | undefined {
  if (task.length > 10000) {
    vscode.window.showWarningMessage(
      "Task context is too long (max 10,000 characters). Truncating."
    );
    return task.substring(0, 10000);
  }
  return undefined; // OK
}
```

### 5.3 Специальные символы

**Обработка:**
- VS Code → Extension: передача через JSON (автоматически экранируется)
- Extension → CLI: передача через spawn args (Node.js экранирует автоматически)
- Многострочный текст: передавать как есть, CLI обработает через аргумент

---

## 6. Testing Scenarios

### 6.1 Manual Testing Checklist

**Control Panel:**
- [ ] Ввод текста сохраняется в workspace state
- [ ] После перезагрузки VS Code текст восстанавливается
- [ ] Auto-resize работает корректно (2-10 строк)
- [ ] Debounce работает (не сохраняет при каждом символе)
- [ ] Многострочный текст отображается корректно

**Stats Webview:**
- [ ] Task context синхронизируется с Control Panel
- [ ] Изменения в Stats → обновляются в Control Panel
- [ ] Изменения в Control Panel → обновляются в Stats

**Integration:**
- [ ] Generate Context передаёт task в CLI
- [ ] Send to AI передаёт task в CLI
- [ ] Show Stats передаёт task в CLI
- [ ] Пустой task не передаётся (нет аргумента --task)
- [ ] Длинный многострочный task работает корректно

### 6.2 Automated Tests (опционально)

```typescript
// test/suite/taskContext.test.ts
suite("Task Context Field", () => {
  test("State persistence", async () => {
    // Проверить сохранение и восстановление из workspace state
  });
  
  test("CLI integration", async () => {
    // Проверить что CliClient.cliRender вызывается с правильным --task
  });
  
  test("Webview sync", async () => {
    // Проверить синхронизацию между Control Panel и Stats
  });
});
```

---

## 7. Implementation Phases

### Phase 1: Core Functionality (P0)
- [ ] Добавить textarea в Control Panel UI
- [ ] Добавить `taskContext` в PanelState
- [ ] Реализовать persistence в workspace state
- [ ] Передавать `--task` в CLI при Generate Context
- [ ] Передавать `--task` в CLI при Send to AI

### Phase 2: Stats Integration (P1)
- [ ] Добавить textarea в Stats Webview UI
- [ ] Реализовать двустороннюю синхронизацию
- [ ] Передавать `--task` в CLI при Show Stats

### Phase 3: UX Improvements (P2)
- [ ] Auto-resize textarea
- [ ] Debounce для сохранения
- [ ] Валидация длины (10k limit)
- [ ] Keyboard shortcuts

### Phase 4: Polish (P3)
- [ ] Accessibility (ARIA labels)
- [ ] High contrast theme support
- [ ] Animations/transitions
- [ ] Automated tests

---

## 8. Documentation Updates

### 8.1 README.md

Добавить секцию "Task Context" в Features:

```markdown
### Task Context

Quickly add final instructions to your generated contexts without editing template files:

1. Enter your task description in the "Task Context" field in Control Panel
2. Click "Send to AI" or "Generate Context"
3. Your task will be included automatically using the `${task}` placeholder in templates

The task context is synchronized across Control Panel and Stats views.
```

### 8.2 VSCode Marketplace Description

Добавить в features list:
- **Task Context Field** — Add dynamic task descriptions to generated contexts

---

## 9. Future Enhancements (Out of Scope)

Не включать в текущую итерацию, но держать в уме для будущего:

- История task context (последние 20 заданий)
- Quick pick с поиском по истории (Ctrl+↑/↓)
- Шаблоны быстрых заданий (snippets)
- Автоматические подсказки на основе git-ветки/открытых файлов
- Отдельный режим "task-only" для быстрой отправки задачи без полного контекста
