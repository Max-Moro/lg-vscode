# Техническое задание: Интеграция VS Code Extension с новой подсистемой токенизации LG

## 1. Бизнес-требования

### Проблемы текущей реализации

1. **Устаревший API**: Extension использует аргумент `--model` и команду `lg list models`, которые удалены в новой версии CLI.

2. **Негибкая конфигурация токенизации**: Пользователь не может явно управлять библиотекой токенизации, энкодером и размером контекстного окна через UI.

3. **Несовместимость схем данных**: JSON-отчеты используют protocol 4 с полем `model`, в то время как новый CLI возвращает protocol 5 с полем `tokenizerLib`.

### Целевое решение

**Адаптация UI под явный API токенизации**: обновить Control Panel, Stats Webview и все внутренние сервисы для работы с тремя явными параметрами токенизации (`lib`, `encoder`, `ctx-limit`) вместо одного магического `model`.

Это обеспечивает:
- **Прозрачность**: пользователь видит и контролирует все параметры токенизации
- **Актуальность**: не требуется обновление расширения при появлении новых моделей
- **Универсальность**: работа с любыми провайдерами через выбор библиотеки

### Контекст использования

Extension интегрируется с CLI через JSON API и предоставляет UI для:
- Выбора библиотеки токенизации (tiktoken, tokenizers, sentencepiece)
- Выбора энкодера/модели токенизации
- Указания размера контекстного окна
- Сохранения предпочтений пользователя между сеансами

---

## 2. Технические требования

### 2.1. Обновление TypeScript моделей данных

#### Старые модели (удалить)

```typescript
// src/models/report.ts - СТАРОЕ
export interface RunResult {
  protocol: number; // 4
  model: string;     // ❌ УДАЛИТЬ
  encoder: string;
  ctxLimit: number;
  // ...
}
```

#### Новые модели

```typescript
// src/models/report.ts - НОВОЕ
export interface RunResult {
  protocol: number; // 5
  tokenizerLib: string;  // ⭐ НОВОЕ: "tiktoken" | "tokenizers" | "sentencepiece"
  encoder: string;
  ctxLimit: number;
  // ...
}
```

### 2.2. Обновление CLI параметров

#### Старые параметры (удалить)

```typescript
// src/cli/CliClient.ts - СТАРОЕ
export interface CliOptions {
  model?: string;  // ❌ УДАЛИТЬ
  // ...
}
```

#### Новые параметры

```typescript
// src/cli/CliClient.ts - НОВОЕ
export interface CliOptions {
  tokenizerLib: string;   // ⭐ НОВОЕ: обязательный
  encoder: string;        // ⭐ НОВОЕ: обязательный
  ctxLimit: number;       // ⭐ НОВОЕ: обязательный
  // остальные без изменений
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}
```

### 2.3. Обновление UI в Control Panel

#### Старая структура (удалить)

```html
<!-- media/control.html - СТАРОЕ -->
<div class="block">
  <h3>Project Scope</h3>
  <div class="row">
    <span class="cluster">
      <label class="muted">Model:</label>
      <select id="model"></select>  <!-- ❌ УДАЛИТЬ -->
    </span>
  </div>
</div>
```

#### Новая структура

```html
<!-- media/control.html - НОВОЕ -->
<div class="block">
  <h3><span class="codicon codicon-symbol-unit"></span> Tokenization Settings</h3>
  
  <!-- Библиотека токенизации -->
  <div class="row">
    <span class="cluster">
      <label>Library:</label>
      <select id="tokenizerLib" data-state-key="tokenizerLib">
        <!-- Заполняется из lg list tokenizer-libs -->
      </select>
    </span>
  </div>
  
  <!-- Энкодер (зависит от выбранной библиотеки) -->
  <div class="row">
    <span class="cluster">
      <label>Encoder:</label>
      <select id="encoder" data-state-key="encoder">
        <!-- Заполняется из lg list encoders --lib <lib> -->
      </select>
    </span>
  </div>
  
  <!-- Размер контекстного окна -->
  <div class="row">
    <span class="cluster">
      <label>Context Limit:</label>
      <input type="number" id="ctxLimit" data-state-key="ctxLimit" 
             min="1000" max="2000000" step="1000" 
             placeholder="128000" />
      <span class="muted">tokens</span>
    </span>
  </div>
</div>
```

### 2.4. Обновление состояния панели

#### Старое состояние (удалить поля)

```typescript
// src/views/ControlPanelView.ts - СТАРОЕ
type PanelState = {
  section: string;
  template: string;
  model: string;  // ❌ УДАЛИТЬ
  // ...
};

const DEFAULT_STATE: PanelState = {
  section: "all-src",
  template: "",
  model: "o3",  // ❌ УДАЛИТЬ
  // ...
};
```

#### Новое состояние

```typescript
// src/views/ControlPanelView.ts - НОВОЕ
type PanelState = {
  section: string;
  template: string;
  // ⭐ НОВЫЕ поля токенизации
  tokenizerLib: string;  // "tiktoken" | "tokenizers" | "sentencepiece"
  encoder: string;       // зависит от lib
  ctxLimit: number;      // в токенах
  // остальные без изменений
  modes: Record<string, string>;
  tags: string[];
  taskText: string;
  targetBranch: string;
};

const DEFAULT_STATE: PanelState = {
  section: "all-src",
  template: "",
  // ⭐ НОВЫЕ дефолты
  tokenizerLib: "tiktoken",
  encoder: "cl100k_base",
  ctxLimit: 128000,
  // остальные без изменений
  modes: {},
  tags: [],
  taskText: "",
  targetBranch: ""
};
```

### 2.5. Обновление Stats Webview

#### Отображение информации о токенизации

```html
<!-- media/stats.html - обновить заголовок -->
<!-- БЫЛО -->
<p class="muted">
  Scope: <b>${esc(scope)}</b> • 
  Name: <b>${esc(name)}</b> • 
  Model: <b>${esc(data.model)}</b> • 
  Encoder: <b>${esc(data.encoder)}</b> • 
  Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens
</p>

<!-- СТАЛО -->
<p class="muted">
  Scope: <b>${esc(scope)}</b> • 
  Name: <b>${esc(name)}</b> •
  Tokenizer: <b>${esc(data.tokenizerLib)}</b> • 
  Encoder: <b>${esc(data.encoder)}</b> • 
  Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens
</p>
```

### 2.6. Обновление сервисов

Все сервисы должны передавать новые параметры вместо `model`:

- `src/services/ContextService.ts`
- `src/services/ListingService.ts`
- `src/services/StatsService.ts`

---

## 3. Архитектура решения

### 3.1. Удаляемые сущности

#### TypeScript типы
- Удалить интерфейс `ModelEntry` из `src/services/CatalogService.ts`
- Удалить функцию `listModelsJson()` из `src/services/CatalogService.ts`

#### HTML элементы
- Удалить `<select id="model">` из `media/control.html`
- Удалить блок "Project Scope" (если содержит только model)

### 3.2. Новые сущности

#### TypeScript типы

```typescript
// src/services/CatalogService.ts - НОВОЕ

export interface TokenizerLibEntry {
  name: string; // "tiktoken" | "tokenizers" | "sentencepiece"
}

export interface EncoderEntry {
  name: string; // имя энкодера или модели токенизации
  cached?: boolean; // помечает скачанные модели
}

export async function listTokenizerLibsJson(): Promise<string[]> {
  const data = await cliList("tokenizer-libs");
  return Array.isArray(data.tokenizer_libs) 
    ? data.tokenizer_libs 
    : [];
}

export async function listEncodersJson(lib: string): Promise<EncoderEntry[]> {
  const args = ["list", "encoders", "--lib", lib];
  const out = await runCli(args, { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  // Парсим ответ - может быть массив строк или объекты с метаданными
  if (Array.isArray(data.encoders)) {
    return data.encoders.map((e: string | { name: string; cached?: boolean }) => 
      typeof e === "string" ? { name: e } : e
    );
  }
  
  return [];
}
```

#### HTML блоки

Новый блок "Tokenization Settings" (см. раздел 2.3)

---

## 4. Детальная реализация

### 4.1. Обновление моделей данных

**Файл**: `src/models/report.ts`

```typescript
/*
 * AUTO-GENERATED - ОБНОВЛЕННАЯ ВЕРСИЯ (protocol 5)
 */

export interface RunResult {
  protocol: number; // должно быть 5
  scope: "context" | "section";
  target: string;
  
  // ⭐ ОБНОВЛЕННЫЕ поля токенизации
  tokenizerLib: string; // "tiktoken" | "tokenizers" | "sentencepiece"
  encoder: string;
  ctxLimit: number;
  
  // Остальные поля без изменений
  total: {
    sizeBytes: number;
    tokensProcessed: number;
    tokensRaw: number;
    savedTokens: number;
    savedPct: number;
    ctxShare: number;
    renderedTokens?: number;
    renderedOverheadTokens?: number;
    metaSummary: {
      [k: string]: number;
    };
  };
  files: {
    path: string;
    sizeBytes: number;
    tokensRaw: number;
    tokensProcessed: number;
    savedTokens: number;
    savedPct: number;
    promptShare: number;
    ctxShare: number;
    meta: {
      [k: string]: string | number | boolean;
    };
  }[];
  context?: {
    templateName: string;
    sectionsUsed: {
      [k: string]: number;
    };
    finalRenderedTokens?: number;
    templateOnlyTokens?: number;
    templateOverheadPct?: number;
    finalCtxShare?: number;
  };
}
```

---

### 4.2. Обновление CLI клиента

**Файл**: `src/cli/CliClient.ts`

```typescript
import { runCli } from "./CliResolver";
import type { RunResult } from "../models/report";
import type { DiagReport } from "../models/diag_report";

// ⭐ ОБНОВЛЕННЫЙ интерфейс
export interface CliOptions {
  // НОВЫЕ обязательные параметры токенизации
  tokenizerLib: string;  // "tiktoken" | "tokenizers" | "sentencepiece"
  encoder: string;       // имя энкодера
  ctxLimit: number;      // размер окна в токенах
  
  // Остальные параметры без изменений
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function cliRender(target: string, options: CliOptions): Promise<string> {
  const args: string[] = ["render", target];
  
  // ⭐ НОВЫЕ параметры вместо --model
  args.push("--lib", options.tokenizerLib);
  args.push("--encoder", options.encoder);
  args.push("--ctx-limit", String(options.ctxLimit));
  
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
  
  if (options.targetBranch && options.targetBranch.trim()) {
    args.push("--target-branch", options.targetBranch.trim());
  }
  
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    args.push("--task", "-");
    stdinData = options.taskText.trim();
  }
  
  return runCli(args, { timeoutMs: 120_000, stdinData });
}

export async function cliReport(target: string, options: CliOptions): Promise<RunResult> {
  const args: string[] = ["report", target];
  
  // ⭐ НОВЫЕ параметры вместо --model
  args.push("--lib", options.tokenizerLib);
  args.push("--encoder", options.encoder);
  args.push("--ctx-limit", String(options.ctxLimit));
  
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
  
  if (options.targetBranch && options.targetBranch.trim()) {
    args.push("--target-branch", options.targetBranch.trim());
  }
  
  let stdinData: string | undefined;
  if (options.taskText && options.taskText.trim()) {
    args.push("--task", "-");
    stdinData = options.taskText.trim();
  }
  
  const out = await runCli(args, { timeoutMs: 120_000, stdinData });
  const data = JSON.parse(out);
  return data as RunResult;
}

// cliList остается без изменений для sections/contexts/mode-sets/tag-sets
export async function cliList(what: "sections" | "contexts" | "mode-sets" | "tag-sets") {
  const out = await runCli(["list", what], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  if (what === "mode-sets" || what === "tag-sets") {
    return data;
  }
  
  return data?.[what] ?? data ?? [];
}

export async function cliDiag(rebuild?: boolean): Promise<DiagReport> {
  const args = ["diag"].concat(rebuild ? ["--rebuild-cache"] : []);
  const out = await runCli(args, { timeoutMs: rebuild ? 60_000 : 20_000 });
  const data = JSON.parse(out);
  return data as DiagReport;
}
```

---

### 4.3. Обновление CatalogService

**Файл**: `src/services/CatalogService.ts`

```typescript
import { cliList, runCli } from "../cli/CliClient";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";

export async function listSectionsJson(): Promise<string[]> {
  const list = await cliList("sections");
  return Array.isArray(list) ? (list as string[]) : [];
}

export async function listContextsJson(): Promise<string[]> {
  const list = await cliList("contexts");
  return Array.isArray(list) ? (list as string[]) : [];
}

// ❌ УДАЛИТЬ: ModelEntry и listModelsJson()

// ⭐ НОВОЕ: типы для токенизации
export interface EncoderEntry {
  name: string;
  cached?: boolean;
}

// ⭐ НОВОЕ: список библиотек токенизации
export async function listTokenizerLibsJson(): Promise<string[]> {
  const out = await runCli(["list", "tokenizer-libs"], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  return Array.isArray(data?.tokenizer_libs) ? data.tokenizer_libs : [];
}

// ⭐ НОВОЕ: список энкодеров для библиотеки
export async function listEncodersJson(lib: string): Promise<EncoderEntry[]> {
  const out = await runCli(["list", "encoders", "--lib", lib], { timeoutMs: 20_000 });
  const data = JSON.parse(out);
  
  if (!data || !Array.isArray(data.encoders)) {
    return [];
  }
  
  // Поддержка как простых строк, так и объектов с метаданными
  return data.encoders.map((e: string | { name: string; cached?: boolean }) => 
    typeof e === "string" ? { name: e } : e
  );
}

export async function listModeSetsJson(): Promise<ModeSetsList> {
  const data = await cliList("mode-sets");
  return data as ModeSetsList;
}

export async function listTagSetsJson(): Promise<TagSetsList> {
  const data = await cliList("tag-sets");
  return data as TagSetsList;
}
```

---

### 4.4. Обновление параметров в сервисах

#### ContextService

**Файл**: `src/services/ContextService.ts`

```typescript
import { cliRender, cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

// ⭐ ОБНОВЛЕННЫЙ интерфейс
export interface ContextParams {
  template: string;
  // НОВЫЕ поля токенизации
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  // Остальные без изменений
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runContext(templateName: string, options: CliOptions): Promise<string> {
  const target = `ctx:${templateName}`;
  return cliRender(target, options);
}

export async function runContextStatsJson(params: ContextParams): Promise<RunResult> {
  const target = `ctx:${params.template}`;
  const options: CliOptions = {
    tokenizerLib: params.tokenizerLib,
    encoder: params.encoder,
    ctxLimit: params.ctxLimit,
    modes: params.modes,
    tags: params.tags,
    taskText: params.taskText,
    targetBranch: params.targetBranch
  };
  return cliReport(target, options);
}
```

#### ListingService

**Файл**: `src/services/ListingService.ts`

```typescript
import { cliRender, cliReport, type CliOptions } from "../cli/CliClient";

// ⭐ ОБНОВЛЕННЫЙ интерфейс
export interface ListingParams {
  section?: string;
  // НОВЫЕ поля токенизации
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  // Остальные без изменений
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runListing(params: ListingParams): Promise<string> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const options: CliOptions = {
    tokenizerLib: params.tokenizerLib,
    encoder: params.encoder,
    ctxLimit: params.ctxLimit,
    modes: params.modes,
    tags: params.tags,
    taskText: params.taskText,
    targetBranch: params.targetBranch
  };
  return cliRender(target, options);
}

export async function runListIncludedJson(params: ListingParams): Promise<{ path: string; sizeBytes: number }[]> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const options: CliOptions = {
    tokenizerLib: params.tokenizerLib,
    encoder: params.encoder,
    ctxLimit: params.ctxLimit,
    modes: params.modes,
    tags: params.tags,
    taskText: params.taskText,
    targetBranch: params.targetBranch
  };
  const data = await cliReport(target, options);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f: any) => ({ path: f.path, sizeBytes: f.sizeBytes ?? 0 }));
}
```

#### StatsService

**Файл**: `src/services/StatsService.ts`

```typescript
import { cliReport, type CliOptions } from "../cli/CliClient";
import type { RunResult } from "../models/report";

// ⭐ ОБНОВЛЕННЫЙ интерфейс
export interface StatsParams {
  section?: string;
  // НОВЫЕ поля токенизации
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  // Остальные без изменений
  modes?: Record<string, string>;
  tags?: string[];
  taskText?: string;
  targetBranch?: string;
}

export async function runStatsJson(params: StatsParams): Promise<RunResult> {
  const target = params.section ? `sec:${params.section}` : "sec:all";
  const options: CliOptions = {
    tokenizerLib: params.tokenizerLib,
    encoder: params.encoder,
    ctxLimit: params.ctxLimit,
    modes: params.modes,
    tags: params.tags,
    taskText: params.taskText,
    targetBranch: params.targetBranch
  };
  return cliReport(target, options);
}
```

---

### 4.5. Обновление Control Panel View

**Файл**: `src/views/ControlPanelView.ts`

#### Обновление типа состояния

```typescript
// ⭐ ОБНОВЛЕННЫЙ тип состояния
type PanelState = {
  section: string;
  template: string;
  
  // НОВЫЕ поля токенизации
  tokenizerLib: string;  // "tiktoken" | "tokenizers" | "sentencepiece"
  encoder: string;       // зависит от выбранной библиотеки
  ctxLimit: number;      // размер окна в токенах
  
  // Остальные без изменений
  modes: Record<string, string>;
  tags: string[];
  taskText: string;
  targetBranch: string;
};

const MKEY = "lg.control.state";

// ⭐ ОБНОВЛЕННЫЙ дефолт
const DEFAULT_STATE: PanelState = {
  section: "all-src",
  template: "",
  
  // НОВЫЕ дефолты токенизации
  tokenizerLib: "tiktoken",
  encoder: "cl100k_base",
  ctxLimit: 128000,
  
  // Остальные без изменений
  modes: {},
  tags: [],
  taskText: "",
  targetBranch: ""
};
```

#### Обновление методов получения параметров

```typescript
export class ControlPanelView implements vscode.WebviewViewProvider {
  // ... existing fields ...

  // ⭐ ОБНОВЛЕННЫЙ метод
  private getTokenizationParams(state: PanelState): { 
    tokenizerLib: string;
    encoder: string;
    ctxLimit: number;
  } {
    return {
      tokenizerLib: state.tokenizerLib || "tiktoken",
      encoder: state.encoder || "cl100k_base",
      ctxLimit: state.ctxLimit || 128000
    };
  }

  // ⭐ ОБНОВЛЕННЫЙ метод (был getAdaptiveParams)
  private getFullCliOptions(state: PanelState): CliOptions {
    return {
      ...this.getTokenizationParams(state),
      modes: Object.keys(state.modes || {}).length > 0 ? state.modes : undefined,
      tags: Array.isArray(state.tags) && state.tags.length > 0 ? state.tags : undefined,
      taskText: state.taskText && state.taskText.trim() ? state.taskText.trim() : undefined,
      targetBranch: state.targetBranch && state.targetBranch.trim() ? state.targetBranch.trim() : undefined
    };
  }
}
```

#### Обновление handlers

```typescript
// ⭐ ОБНОВЛЕННЫЙ handler (пример для onGenerateListing)
private async onGenerateListing() {
  const s = this.getState();
  const params: ListingParams = {
    section: s.section,
    ...this.getTokenizationParams(s),
    ...this.getAdaptiveParams(s) // modes, tags, taskText, targetBranch
  };
  const content = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "LG: Generating listing…", cancellable: false },
    () => runListing(params)
  );
  await this.vdocs.open("listing", `Listing — ${s.section}.md`, content);
}

// Аналогично обновить:
// - onGenerateContext()
// - onShowContextStats()
// - onShowIncluded()
// - onShowStats()
// - onSendContextToAI()
// - onSendListingToAI()
```

#### Обновление pushListsAndState()

```typescript
// ⭐ ОБНОВЛЕННЫЙ метод
private pushListsAndState(): Promise<void> {
  this.listsChain = this.listsChain
    .then(async () => {
      const sections = await listSectionsJson().catch(() => [] as string[]);
      const contexts = await listContextsJson().catch(() => [] as string[]);
      
      // ❌ УДАЛИТЬ: const models = await listModelsJson()...
      
      // ⭐ НОВОЕ: загрузка библиотек токенизации
      const tokenizerLibs = await listTokenizerLibsJson().catch(() => [] as string[]);
      
      // ⭐ НОВОЕ: загрузка энкодеров для текущей библиотеки
      const state = this.getState();
      const currentLib = state.tokenizerLib || "tiktoken";
      const encoders = await listEncodersJson(currentLib).catch(() => [] as any[]);
      
      const modeSets = await listModeSetsJson().catch(() => ({ "mode-sets": [] } as ModeSetsList));
      const tagSets = await listTagSetsJson().catch(() => ({ "tag-sets": [] } as TagSetsList));
      const branches = await this.fetchBranches();

      let stateChanged = false;
      
      // Валидация section
      if (!sections.includes(state.section) && sections.length) {
        state.section = sections[0];
        stateChanged = true;
      }
      
      // ⭐ НОВОЕ: валидация tokenizerLib
      if (!tokenizerLibs.includes(state.tokenizerLib) && tokenizerLibs.length) {
        state.tokenizerLib = tokenizerLibs[0];
        stateChanged = true;
      }
      
      // ⭐ НОВОЕ: валидация encoder
      const encoderNames = encoders.map(e => e.name);
      if (!encoderNames.includes(state.encoder) && encoderNames.length) {
        state.encoder = encoderNames[0];
        stateChanged = true;
      }
      
      // ⭐ НОВОЕ: валидация ctxLimit (разумные границы)
      if (!state.ctxLimit || state.ctxLimit < 1000 || state.ctxLimit > 2_000_000) {
        state.ctxLimit = 128000;
        stateChanged = true;
      }
      
      if (stateChanged) {
        await this.context.workspaceState.update(MKEY, state);
      }
      
      // ⭐ ОБНОВЛЕННОЕ сообщение с новыми данными
      this.post({ 
        type: "data", 
        sections, 
        contexts, 
        tokenizerLibs,  // вместо models
        encoders,       // вместо models
        modeSets, 
        tagSets, 
        branches, 
        state 
      });
    })
    .catch(() => {});
  return this.listsChain;
}
```

#### Обновление обработчика смены библиотеки

```typescript
// ⭐ НОВЫЙ метод: обработка смены библиотеки токенизации
private async onTokenizerLibChange(lib: string) {
  // При смене библиотеки перезагружаем список энкодеров
  const encoders = await listEncodersJson(lib).catch(() => [] as any[]);
  
  const state = this.getState();
  const encoderNames = encoders.map(e => e.name);
  
  // Если текущий энкодер не совместим с новой библиотекой - сбрасываем на первый
  if (!encoderNames.includes(state.encoder) && encoderNames.length) {
    this.setState({ tokenizerLib: lib, encoder: encoderNames[0] });
  } else {
    this.setState({ tokenizerLib: lib });
  }
  
  // Отправляем обновленный список энкодеров в webview
  this.post({ type: "encoders", encoders });
}
```

#### Обновление message handler

```typescript
view.webview.onDidReceiveMessage(async (msg) => {
  try {
    switch (msg.type) {
      case "init":
        await this.bootstrapOnce();
        break;
      case "setState":
        this.setState(msg.state as Partial<PanelState>);
        break;
      
      // ⭐ НОВЫЙ обработчик смены библиотеки
      case "tokenizerLibChanged":
        await this.onTokenizerLibChange(msg.lib);
        break;
      
      // ... остальные handlers без изменений ...
      
      case "generateListing":
        await this.onGenerateListing();
        break;
      // и т.д.
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
  }
});
```

---

### 4.6. Обновление HTML шаблона Control Panel

**Файл**: `media/control.html`

**Удалить старый блок:**

```html
<!-- ❌ УДАЛИТЬ весь блок "Project Scope" -->
<div class="block">
  <h3><span class="codicon codicon-organization"></span> Project Scope</h3>
  <div class="row">
    <span class="cluster" title="Параметры для расчета статистики">
      <label class="muted">Model:</label>
      <select id="model" data-state-key="model"></select>
    </span>
  </div>
</div>
```

**Добавить новый блок (после "Inspect", перед "Utilities"):**

```html
<!-- ⭐ НОВЫЙ блок Tokenization Settings -->
<div class="block">
  <h3><span class="codicon codicon-symbol-unit"></span> Tokenization Settings</h3>
  
  <!-- Библиотека токенизации -->
  <div class="row">
    <span class="cluster" title="Библиотека токенизации (tiktoken, tokenizers, sentencepiece)">
      <label>Library:</label>
      <select id="tokenizerLib" data-state-key="tokenizerLib"></select>
    </span>
  </div>
  
  <!-- Энкодер (зависит от библиотеки) -->
  <div class="row">
    <span class="cluster" title="Энкодер или модель токенизации">
      <label>Encoder:</label>
      <select id="encoder" data-state-key="encoder"></select>
    </span>
  </div>
  
  <!-- Размер контекстного окна -->
  <div class="row">
    <span class="cluster" title="Размер контекстного окна в токенах">
      <label>Context Limit:</label>
      <input type="number" id="ctxLimit" data-state-key="ctxLimit" 
        class="lg-input lg-input--number"
             min="1000" max="2000000" step="1000" 
             placeholder="128000" />
      <span class="muted">tokens</span>
    </span>
  </div>
</div>
```

---

### 4.7. Обновление CSS для нового UI

**Файл**: `media/control.css`

```css
/* ========== TOKENIZATION SETTINGS STYLES ========== */

/* Базовый стиль для контролов */
.lg-input {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
  border-radius: 4px;
  padding: 2px 6px;
  font: inherit;
}

.lg-input:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 1px;
}

.lg-input:disabled {
  color: var(--vscode-disabledForeground);
  opacity: 0.7;
}

/* Числовой вариант */
input.lg-input--number {
  flex: 0 1 auto;
  appearance: textfield;
  -moz-appearance: textfield;
}

input.lg-input--number::-webkit-outer-spin-button,
input.lg-input--number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* В узком режиме делаем input на всю ширину */
@container control-panel (max-width: 200px) {
  input.lg-input--number {
    width: 100%;
    max-width: 100%;
  }
}
```

---

### 4.8. Обновление JavaScript Control Panel

**Файл**: `media/control.js`

**Добавить обработчик смены библиотеки:**

```javascript
/* global UI */
(function () {
  const vscode = UI.acquire();
  const store = UI.stateStore(vscode, "lg.control.uiState");

  const cached = store.get();
  if (cached && Object.keys(cached).length) {
    UI.setState(cached);
  }

  // ... existing code ...

  // ⭐ НОВОЕ: специальный обработчик для смены библиотеки токенизации
  UI.delegate(document, "#tokenizerLib", "change", (el) => {
    const lib = el.value;
    
    // Сохраняем в локальный стор
    store.merge({ tokenizerLib: lib });
    
    // Уведомляем TS сторону о смене (чтобы перезагрузить энкодеры)
    UI.post(vscode, "tokenizerLibChanged", { lib });
  });

  // ⭐ НОВОЕ: валидация ctxLimit на клиенте
  UI.delegate(document, "#ctxLimit", "change", (el) => {
    const input = el;
    let value = parseInt(input.value, 10);
    
    // Проверяем границы
    if (isNaN(value) || value < 1000) {
      value = 1000;
    } else if (value > 2000000) {
      value = 2000000;
    }
    
    // Обновляем значение если было скорректировано
    if (input.value !== String(value)) {
      input.value = String(value);
    }
    
    // Сохраняем
    const patch = { ctxLimit: value };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  });

  // ... existing message handler ...

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      // Заполняем селекты
      UI.fillSelect(UI.qs("#section"), msg.sections, { value: msg.state.section || "" });
      UI.fillSelect(UI.qs("#template"), msg.contexts, { value: msg.state.template || "" });
      
      // ⭐ НОВОЕ: заполняем библиотеки токенизации
      UI.fillSelect(UI.qs("#tokenizerLib"), msg.tokenizerLibs || [], { 
        value: msg.state.tokenizerLib || "tiktoken" 
      });
      
      // ⭐ НОВОЕ: заполняем энкодеры
      UI.fillSelect(UI.qs("#encoder"), msg.encoders || [], {
        getValue: it => (typeof it === "string" ? it : (it?.name ?? "")),
        getLabel: it => {
          if (typeof it === "string") return it;
          // Помечаем скачанные модели
          return it?.cached ? `${it.name} ✓` : it?.name;
        },
        value: msg.state.encoder || ""
      });

      // Адаптивные настройки
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);
      
      if (msg.branches) {
        currentBranches = msg.branches;
        populateBranches(msg.branches);
      }

      applyState(msg.state);
    } else if (msg?.type === "encoders") {
      // ⭐ НОВОЕ: обновление списка энкодеров после смены библиотеки
      const state = store.get();
      UI.fillSelect(UI.qs("#encoder"), msg.encoders || [], {
        getValue: it => (typeof it === "string" ? it : (it?.name ?? "")),
        getLabel: it => {
          if (typeof it === "string") return it;
          return it?.cached ? `${it.name} ✓` : it?.name;
        },
        value: state.encoder || ""
      });
    } else if (msg?.type === "state") {
      applyState(msg.state);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function applyState(s) {
    const next = {};
    if (s.section !== undefined) next["section"] = s.section;
    if (s.template !== undefined) next["template"] = s.template;
    
    // ⭐ НОВОЕ: применение состояния токенизации
    if (s.tokenizerLib !== undefined) next["tokenizerLib"] = s.tokenizerLib;
    if (s.encoder !== undefined) next["encoder"] = s.encoder;
    if (s.ctxLimit !== undefined) next["ctxLimit"] = s.ctxLimit;
    
    if (s.taskText !== undefined) next["taskText"] = s.taskText;
    if (s.targetBranch !== undefined) next["targetBranch"] = s.targetBranch;
    
    if (s.modes) {
      applyModesState(s.modes);
    }
    
    if (s.tags) {
      applyTagsState(s.tags);
    }
    
    if (Object.keys(next).length) {
      UI.setState(next);
      store.merge(next);
    }
    
    updateTargetBranchVisibility();
  }

  // ... rest of existing code ...
})();
```

---

### 4.9. Обновление Stats Webview

**Файл**: `media/stats.js`

**Обновить рендеринг заголовка:**

```javascript
function render(data) {
  // ... existing code ...

  const total = data.total || {};
  const scope = data.scope || "context";

  let name = "";
  if (scope === "context") {
    name = data.target.startsWith("ctx:") ? data.target.slice(4) : data.target;
  } else if (scope === "section") {
    name = data.target.startsWith("sec:") ? data.target.slice(4) : data.target;
  }
  
  const scopeLabel = scope === "context" ? "Context" : "Section";
  document.title = `${scopeLabel}: ${name} — Statistics`;

  // ... existing code ...

  // ⭐ ОБНОВЛЕННЫЙ заголовок с новыми полями
  app.innerHTML = `
    <h2>${esc(scopeLabel)}: ${esc(name)} — Statistics</h2>
    <p class="muted">
      Scope: <b>${esc(scope)}</b> • 
      Name: <b>${esc(name)}</b> • 
      Tokenizer: <b>${esc(data.tokenizerLib)}</b> • 
      Encoder: <b>${esc(data.encoder)}</b> • 
      Ctx limit: <b>${fmtInt(data.ctxLimit)}</b> tokens
    </p>
    
    <!-- ... rest of HTML remains same ... -->
  `;

  // ... rest of function remains same ...
}
```

---

### 4.10. Обновление настроек расширения

**Файл**: `package.json`

Просто удалить старый параметр "Model For Stats".
Новые настройки добавлять не нужно.

---

## 5. Миграция состояния пользователей

Старое состояние не нужно мигрировать. Мы его просто отбрасываем.

---

## 6. Обратная совместимость

### 6.1. Обработка старых отчетов (protocol 4)

Старые отчеты не (protocol 4) к новому формату. Теперь всегда работаем тольок с новым API.

## 7. Итоговая архитектура (диаграмма)

```
Control Panel UI (HTML)
  ├─> Library Select (tokenizerLib)
  ├─> Encoder Select (encoder) 
  └─> Context Limit Input (ctxLimit)
       ↓
  ControlPanelView.ts
    ├─> onTokenizerLibChange() → listEncodersJson(lib)
    ├─> pushListsAndState() → listTokenizerLibsJson()
    └─> getFullCliOptions() → формирование CliOptions
         ↓
  Services (Context/Listing/Stats)
    └─> CliClient.ts
         ├─> cliRender(target, options)
         │    └─> --lib --encoder --ctx-limit
         └─> cliReport(target, options)
              └─> --lib --encoder --ctx-limit
                   ↓
  LG CLI (Python)
    ├─> lg render ctx:name --lib tiktoken --encoder cl100k_base --ctx-limit 128000
    └─> lg report sec:core --lib tokenizers --encoder gpt2 --ctx-limit 50000
         ↓
  JSON Response (protocol 5)
    ├─> tokenizerLib: "tiktoken"
    ├─> encoder: "cl100k_base"
    └─> ctxLimit: 128000

Stats Webview
  ├─> Отображение: "Tokenizer: tiktoken • Encoder: cl100k_base • Ctx limit: 128,000 tokens"
  └─> Адаптация старых отчетов (protocol 4 → 5)
```
