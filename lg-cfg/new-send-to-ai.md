# Техническое задание: Система быстрой отправки контента в AI

## 1. Бизнес-требования

### 1.1 Цель
Реализовать универсальную систему отправки сгенерированного контекста из LG напрямую в AI-ассистенты с минимальным количеством действий пользователя.

### 1.2 Ключевые требования
- **Единая кнопка "Send to AI"** в Control Panel
- **Плагинная архитектура** провайдеров с легким добавлением новых
- **Настройка через VS Code settings** - один параметр `lg.ai.provider`
- **Первичная автодетекция** при установке расширения
- **Явная обработка ошибок** без автоматических fallback
- **Корректная визуализация** процесса отправки (progress, success, errors)

### 1.3 Провайдеры первой итерации
1. **Clipboard** - универсальный fallback (priority: 10)
2. **GitHub Copilot** - extension-based (priority: 80)
3. **Cursor Composer** - fork-based (priority: 90)
4. **Claude Code CLI** - CLI-based (priority: 50)
5. **OpenAI API** - network-based (priority: 35)

---

## 2. Архитектура системы

### 2.1 Общая структура

```
src/services/ai/
├── index.ts                      # Точка входа, регистрация провайдеров
├── types.ts                      # Базовые типы и интерфейсы
├── BaseAiProvider.ts             # Базовый абстрактный класс
├── AiIntegrationService.ts       # Центральный сервис управления
├── detector.ts                   # Система детектирования провайдеров
├── providers/
│   ├── clipboard/
│   │   ├── index.ts
│   │   ├── provider.ts
│   │   └── detector.ts
│   ├── copilot/
│   │   ├── index.ts
│   │   ├── provider.ts
│   │   └── detector.ts
│   ├── cursor/
│   │   ├── index.ts
│   │   ├── provider.ts
│   │   └── detector.ts
│   ├── claude-cli/
│   │   ├── index.ts
│   │   ├── provider.ts
│   │   └── detector.ts
│   └── openai/
│       ├── index.ts
│       ├── provider.ts
│       └── detector.ts
└── CopilotExtensionService.ts    # Вспомогательный сервис для Copilot
```

### 2.2 Базовые классы по категориям

```
BaseAiProvider (abstract)
├── ClipboardProvider (direct implementation)
├── BaseExtensionProvider (abstract) 
│   └── CopilotProvider
├── BaseForkProvider (abstract)
│   └── CursorProvider
├── BaseCliProvider (abstract)
│   └── ClaudeCliProvider
└── BaseNetworkProvider (abstract)
    └── OpenAiProvider
```

---

## 3. Детальная реализация

### 3.1 Базовые типы и интерфейсы

**Файл: `src/services/ai/types.ts`**

```typescript
/**
 * Базовые типы для AI Integration системы
 */

/**
 * Информация о детекторе провайдера
 */
export interface ProviderDetector {
  /** Приоритет провайдера (0-100, выше = предпочтительнее) */
  priority: number;
  
  /** 
   * Проверка доступности провайдера
   * Вызывается один раз при активации расширения
   */
  detect(): Promise<boolean>;
}

/**
 * Интерфейс провайдера AI
 */
export interface AiProvider {
  /** Уникальный идентификатор провайдера */
  readonly id: string;
  
  /** Человекочитаемое имя провайдера */
  readonly name: string;
  
  /**
   * Отправить контент в AI
   * @throws Error при ошибке отправки
   */
  send(content: string): Promise<void>;
}

/**
 * Полная информация о провайдере с детектором
 */
export interface ProviderModule {
  provider: AiProvider;
  detector: ProviderDetector;
}
```

---

### 3.2 Базовый абстрактный класс провайдера

**Файл: `src/services/ai/BaseAiProvider.ts`**

```typescript
import * as vscode from "vscode";
import type { AiProvider } from "./types";

/**
 * Базовый абстрактный класс для всех AI провайдеров
 */
export abstract class BaseAiProvider implements AiProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract send(content: string): Promise<void>;
}

/**
 * Базовый класс для Extension-based провайдеров
 */
export abstract class BaseExtensionProvider extends BaseAiProvider {
  protected abstract extensionId: string;
  protected abstract commandName: string;
  
  /**
   * Проверка активности расширения
   */
  protected async ensureExtensionActive(): Promise<void> {
    const ext = vscode.extensions.getExtension(this.extensionId);
    if (!ext) {
      throw new Error(`Extension ${this.extensionId} not found`);
    }
    if (!ext.isActive) {
      await ext.activate();
    }
  }
  
  async send(content: string): Promise<void> {
    await this.ensureExtensionActive();
    await this.sendToExtension(content);
  }
  
  protected abstract sendToExtension(content: string): Promise<void>;
}

/**
 * Базовый класс для Fork-based провайдеров (Cursor, Windsurf)
 */
export abstract class BaseForkProvider extends BaseAiProvider {
  protected abstract commandPrefix: string;
  
  /**
   * Проверка доступности команд форка
   */
  protected async hasForkCommands(): Promise<boolean> {
    const commands = await vscode.commands.getCommands();
    return commands.some(cmd => cmd.startsWith(this.commandPrefix));
  }
  
  async send(content: string): Promise<void> {
    if (!(await this.hasForkCommands())) {
      throw new Error(`${this.name} commands not found. Are you running in ${this.name}?`);
    }
    await this.sendToFork(content);
  }
  
  protected abstract sendToFork(content: string): Promise<void>;
}

/**
 * Базовый класс для CLI-based провайдеров
 */
export abstract class BaseCliProvider extends BaseAiProvider {
  protected abstract cliCommand: string;
  
  /**
   * Создать и подготовить терминал
   */
  protected async ensureTerminal(): Promise<vscode.Terminal> {
    // Проверяем существующий терминал
    const existing = vscode.window.terminals.find(t => t.name === this.name);
    if (existing) {
      return existing;
    }
    
    // Создаем новый терминал
    const terminal = vscode.window.createTerminal({
      name: this.name,
      hideFromUser: false
    });
    
    // Показываем терминал
    terminal.show(true);
    
    // Даем время на инициализацию shell (простая задержка)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return terminal;
  }
  
  /**
   * Создать временный файл с контентом
   */
  protected async createTempFile(content: string): Promise<string> {
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs/promises");
    
    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const filename = `lg-ai-${timestamp}.md`;
    const filepath = path.join(tmpDir, filename);
    
    await fs.writeFile(filepath, content, "utf-8");
    
    return filepath;
  }
  
  async send(content: string): Promise<void> {
    const terminal = await this.ensureTerminal();
    const filepath = await this.createTempFile(content);
    
    await this.executeInTerminal(terminal, filepath);
  }
  
  protected abstract executeInTerminal(terminal: vscode.Terminal, filepath: string): Promise<void>;
}

/**
 * Базовый класс для Network-based провайдеров
 */
export abstract class BaseNetworkProvider extends BaseAiProvider {
  protected abstract apiEndpoint: string;
  protected abstract secretKey: string; // ключ в VS Code secrets
  
  /**
   * Получить API токен из секретов
   */
  protected async getApiToken(context: vscode.ExtensionContext): Promise<string> {
    const token = await context.secrets.get(this.secretKey);
    if (!token) {
      throw new Error(
        `API token not found. Please set it in VS Code settings: ${this.secretKey}`
      );
    }
    return token;
  }
  
  /**
   * Отправить HTTP запрос с таймаутом
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
  
  async send(content: string, context: vscode.ExtensionContext): Promise<void> {
    const token = await this.getApiToken(context);
    await this.sendToApi(content, token);
  }
  
  protected abstract sendToApi(content: string, token: string): Promise<void>;
}
```

---

### 3.3 Реализация провайдеров

#### 3.3.1 Clipboard Provider

**Файл: `src/services/ai/providers/clipboard/detector.ts`**

```typescript
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 10,
  
  async detect(): Promise<boolean> {
    // Clipboard всегда доступен
    return true;
  }
};
```

**Файл: `src/services/ai/providers/clipboard/provider.ts`**

```typescript
import * as vscode from "vscode";
import { BaseAiProvider } from "../../BaseAiProvider";

export class ClipboardProvider extends BaseAiProvider {
  readonly id = "clipboard";
  readonly name = "Clipboard";
  
  async send(content: string): Promise<void> {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("Content copied to clipboard");
  }
}

export const provider = new ClipboardProvider();
```

**Файл: `src/services/ai/providers/clipboard/index.ts`**

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

---

#### 3.3.2 GitHub Copilot Provider

**Файл: `src/services/ai/providers/copilot/detector.ts`**

```typescript
import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 80,
  
  async detect(): Promise<boolean> {
    const ext = vscode.extensions.getExtension("GitHub.copilot-chat");
    return ext?.isActive ?? false;
  }
};
```

**Файл: `src/services/ai/providers/copilot/provider.ts`**

```typescript
import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../BaseAiProvider";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "github.copilot";
  readonly name = "GitHub Copilot Chat";
  protected extensionId = "GitHub.copilot-chat";
  protected commandName = "workbench.panel.chat.view.copilot.focus";
  
  protected async sendToExtension(content: string): Promise<void> {
    // Стратегия 1: Открыть панель Copilot Chat
    try {
      await vscode.commands.executeCommand(this.commandName);
    } catch (e) {
      // Fallback команды
      await vscode.commands.executeCommand("workbench.action.chat.open");
    }
    
    // Стратегия 2: Копируем в буфер + уведомление
    await vscode.env.clipboard.writeText(content);
    
    const choice = await vscode.window.showInformationMessage(
      "Content copied to clipboard. Paste it into Copilot Chat.",
      "Open Chat"
    );
    
    if (choice === "Open Chat") {
      try {
        await vscode.commands.executeCommand(this.commandName);
      } catch {
        await vscode.commands.executeCommand("workbench.action.chat.open");
      }
    }
  }
}

export const provider = new CopilotProvider();
```

**Файл: `src/services/ai/providers/copilot/index.ts`**

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

---

#### 3.3.3 Cursor Provider

**Файл: `src/services/ai/providers/cursor/detector.ts`**

```typescript
import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 90,
  
  async detect(): Promise<boolean> {
    const commands = await vscode.commands.getCommands();
    return commands.some(cmd => cmd.startsWith("cursor."));
  }
};
```

**Файл: `src/services/ai/providers/cursor/provider.ts`**

```typescript
import * as vscode from "vscode";
import { BaseForkProvider } from "../../BaseAiProvider";

export class CursorProvider extends BaseForkProvider {
  readonly id = "cursor.composer";
  readonly name = "Cursor Composer";
  protected commandPrefix = "cursor.";
  
  protected async sendToFork(content: string): Promise<void> {
    // Попытка 1: Команда для отправки в Composer
    const possibleCommands = [
      "cursor.composer.sendToChat",
      "cursor.composer.open",
      "cursor.chat.open"
    ];
    
    for (const cmd of possibleCommands) {
      try {
        await vscode.commands.executeCommand(cmd, { text: content });
        return; // успех
      } catch (e) {
        // пробуем следующую команду
        continue;
      }
    }
    
    // Fallback: копируем в буфер + открываем composer
    await vscode.env.clipboard.writeText(content);
    
    try {
      await vscode.commands.executeCommand("cursor.composer.open");
    } catch {
      // Если и это не работает - просто уведомляем
    }
    
    vscode.window.showInformationMessage(
      "Content copied to clipboard. Paste it into Cursor Composer (Ctrl+I)."
    );
  }
}

export const provider = new CursorProvider();
```

**Файл: `src/services/ai/providers/cursor/index.ts`**

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

---

#### 3.3.4 Claude CLI Provider

**Файл: `src/services/ai/providers/claude-cli/detector.ts`**

```typescript
import type { ProviderDetector } from "../../types";
import { spawnToString } from "../../../runner/LgProcess";

export const detector: ProviderDetector = {
  priority: 50,
  
  async detect(): Promise<boolean> {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      await spawnToString(cmd, ["claude"], { timeoutMs: 4000 });
      return true;
    } catch {
      return false;
    }
  }
};
```

**Файл: `src/services/ai/providers/claude-cli/provider.ts`**

```typescript
import * as vscode from "vscode";
import { BaseCliProvider } from "../../BaseAiProvider";

export class ClaudeCliProvider extends BaseCliProvider {
  readonly id = "claude.cli";
  readonly name = "Claude CLI";
  protected cliCommand = "claude";
  
  protected async executeInTerminal(
    terminal: vscode.Terminal,
    filepath: string
  ): Promise<void> {
    // Экранируем путь для shell
    const safePath = process.platform === "win32"
      ? `"${filepath}"`
      : filepath.replace(/ /g, "\\ ");
    
    // Отправляем команду в терминал
    terminal.sendText(`${this.cliCommand} chat --file ${safePath}`);
    
    vscode.window.showInformationMessage(
      `Content sent to ${this.name}. Check the terminal.`
    );
  }
}

export const provider = new ClaudeCliProvider();
```

**Файл: `src/services/ai/providers/claude-cli/index.ts`**

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

---

#### 3.3.5 OpenAI API Provider

**Файл: `src/services/ai/providers/openai/detector.ts`**

```typescript
import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 35,
  
  async detect(): Promise<boolean> {
    // Проверяем наличие токена в секретах
    // Не можем получить context здесь, поэтому просто возвращаем false
    // Пользователь должен явно выбрать этот провайдер и настроить токен
    return false;
  }
};
```

**Файл: `src/services/ai/providers/openai/provider.ts`**

```typescript
import * as vscode from "vscode";
import { BaseNetworkProvider } from "../../BaseAiProvider";

export class OpenAiProvider extends BaseNetworkProvider {
  readonly id = "openai.api";
  readonly name = "OpenAI API";
  protected apiEndpoint = "https://api.openai.com/v1/chat/completions";
  protected secretKey = "lg.openai.apiKey";
  
  private context?: vscode.ExtensionContext;
  
  /** Установить context для доступа к secrets */
  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }
  
  async send(content: string): Promise<void> {
    if (!this.context) {
      throw new Error("Extension context not set for OpenAI provider");
    }
    
    await super.send(content, this.context);
  }
  
  protected async sendToApi(content: string, token: string): Promise<void> {
    const requestBody = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      stream: false
    };
    
    const response = await this.fetchWithTimeout(
      this.apiEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      },
      30000
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }
    
    // Не читаем ответ, просто показываем успех
    vscode.window.showInformationMessage(
      "Content sent to OpenAI API successfully. Check your OpenAI chat interface."
    );
  }
}

export const provider = new OpenAiProvider();
```

**Файл: `src/services/ai/providers/openai/index.ts`**

```typescript
export { provider } from "./provider";
export { detector } from "./detector";
```

---

### 3.4 Центральный сервис интеграции

**Файл: `src/services/ai/AiIntegrationService.ts`**

```typescript
import * as vscode from "vscode";
import type { ProviderModule } from "./types";
import { logInfo, logDebug, logError } from "../../logging/log";

/**
 * Центральный сервис управления AI провайдерами
 */
export class AiIntegrationService {
  private providers = new Map<string, ProviderModule>();
  private context: vscode.ExtensionContext;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  /**
   * Регистрация провайдера
   */
  registerProvider(module: ProviderModule): void {
    this.providers.set(module.provider.id, module);
    logDebug(`AI Provider registered: ${module.provider.id} (priority: ${module.detector.priority})`);
  }
  
  /**
   * Первичная детекция доступных провайдеров
   * Вызывается один раз при активации расширения
   */
  async detectBestProvider(): Promise<string> {
    logInfo("Running AI provider detection...");
    
    const available: Array<{ id: string; priority: number }> = [];
    
    for (const [id, module] of this.providers) {
      try {
        const isAvailable = await module.detector.detect();
        if (isAvailable) {
          available.push({ id, priority: module.detector.priority });
          logDebug(`Provider ${id} is available (priority: ${module.detector.priority})`);
        }
      } catch (e) {
        logError(`Failed to detect provider ${id}`, e);
      }
    }
    
    if (available.length === 0) {
      logInfo("No AI providers detected, falling back to clipboard");
      return "clipboard";
    }
    
    // Сортируем по убыванию приоритета
    available.sort((a, b) => b.priority - a.priority);
    
    const best = available[0];
    logInfo(`Best AI provider detected: ${best.id} (priority: ${best.priority})`);
    
    return best.id;
  }
  
  /**
   * Получить список всех зарегистрированных провайдеров
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }
  
  /**
   * Получить имя провайдера по ID
   */
  getProviderName(id: string): string {
    return this.providers.get(id)?.provider.name ?? id;
  }
  
  /**
   * Отправить контент в указанный провайдер
   */
  async sendToProvider(providerId: string, content: string): Promise<void> {
    const module = this.providers.get(providerId);
    
    if (!module) {
      throw new Error(`Provider '${providerId}' not found`);
    }
    
    logInfo(`Sending content to provider: ${providerId}`);
    
    try {
      // Для OpenAI провайдера устанавливаем context
      if (providerId === "openai.api") {
        const openaiProvider = module.provider as any;
        if (openaiProvider.setContext) {
          openaiProvider.setContext(this.context);
        }
      }
      
      await module.provider.send(content);
      logInfo(`Successfully sent content to ${providerId}`);
    } catch (e) {
      logError(`Failed to send content to ${providerId}`, e);
      throw e;
    }
  }
  
  /**
   * Отправить контент в предпочтительный провайдер из настроек
   */
  async sendToPreferred(content: string): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const preferredId = config.get<string>("lg.ai.provider");
    
    if (!preferredId) {
      throw new Error("No AI provider configured. Please set lg.ai.provider in settings.");
    }
    
    await this.sendToProvider(preferredId, content);
  }
}
```

**Файл: `src/services/ai/index.ts`**

```typescript
/**
 * Центральная точка регистрации всех AI провайдеров
 */
import * as clipboard from "./providers/clipboard";
import * as copilot from "./providers/copilot";
import * as cursor from "./providers/cursor";
import * as claudeCli from "./providers/claude-cli";
import * as openai from "./providers/openai";

import { AiIntegrationService } from "./AiIntegrationService";
import type { ProviderModule } from "./types";

// Список всех провайдеров
const ALL_PROVIDERS: ProviderModule[] = [
  clipboard,
  copilot,
  cursor,
  claudeCli,
  openai,
];

/**
 * Инициализировать AI Integration Service
 */
export function createAiIntegrationService(context: vscode.ExtensionContext): AiIntegrationService {
  const service = new AiIntegrationService(context);
  
  // Регистрируем все провайдеры
  for (const provider of ALL_PROVIDERS) {
    service.registerProvider(provider);
  }
  
  return service;
}

export { AiIntegrationService } from "./AiIntegrationService";
export type { AiProvider, ProviderDetector, ProviderModule } from "./types";
```

---

### 3.5 Интеграция в extension.ts

**Патч для файла: `src/extension.ts`**

```typescript
// Добавить импорт в начало файла
import { createAiIntegrationService, AiIntegrationService } from "./services/ai";

// Добавить глобальную переменную после существующих
let aiService: AiIntegrationService;

// В функции activate, после инициализации логирования:
export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  initLogging(context);
  logInfo("Extension activated");

  // ===== НОВЫЙ КОД: Инициализация AI Integration =====
  aiService = createAiIntegrationService(context);
  
  // Первичная детекция провайдеров
  aiService.detectBestProvider().then(async (bestProviderId) => {
    const config = vscode.workspace.getConfiguration();
    const current = config.get<string>("lg.ai.provider");
    
    // Если настройка не установлена, предлагаем лучший вариант
    if (!current) {
      const providerName = aiService.getProviderName(bestProviderId);
      const choice = await vscode.window.showInformationMessage(
        `LG: Detected AI provider: ${providerName}. Set as default?`,
        "Yes",
        "Choose Another",
        "Later"
      );
      
      if (choice === "Yes") {
        await config.update("lg.ai.provider", bestProviderId, vscode.ConfigurationTarget.Global);
        logInfo(`AI provider set to: ${bestProviderId}`);
      } else if (choice === "Choose Another") {
        vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
      }
    }
  }).catch((e) => {
    logError("Failed to detect AI providers", e);
  });
  // ===== КОНЕЦ НОВОГО КОДА =====

  // ... существующий код ...
  
  // В конце функции, добавить экспорт aiService для других модулей
  (context as any)._lgAiService = aiService;
}

// Добавить функцию-хелпер для получения aiService из других модулей
export function getAiService(context: vscode.ExtensionContext): AiIntegrationService {
  return (context as any)._lgAiService;
}
```

---

### 3.6 Обновление package.json

**Патч для файла: `package.json`**

Добавить в секцию `configuration.properties`:

```json
"lg.ai.provider": {
  "type": "string",
  "enum": [
    "clipboard",
    "github.copilot",
    "cursor.composer",
    "claude.cli",
    "openai.api"
  ],
  "enumDescriptions": [
    "Copy to clipboard (universal fallback)",
    "GitHub Copilot Chat (requires extension)",
    "Cursor Composer (requires Cursor IDE)",
    "Claude CLI (requires claude command in PATH)",
    "OpenAI API (requires API key)"
  ],
  "default": "clipboard",
  "description": "AI provider for 'Send to AI' action"
},
"lg.openai.apiKey": {
  "type": "string",
  "default": "",
  "description": "OpenAI API Key (stored in VS Code secrets)",
  "markdownDescription": "OpenAI API Key for network integration. [Get your key](https://platform.openai.com/api-keys)"
}
```

---

### 3.7 Обновление Control Panel UI

#### 3.7.1 HTML патч

**Патч для файла: `media/control.html`**

Добавить новый блок после блока "AI Contexts":

```html
<!-- ПОСЛЕ блока AI Contexts, ПЕРЕД блоком Adaptive Settings -->

<div class="block">
  <h3><span class="codicon codicon-send"></span>Send to AI</h3>
  <div class="row">
    <span class="cluster">
      <button class="lg-btn lg-btn--primary" id="btn-send-to-ai" data-action="sendToAI" 
              title="Send generated content to configured AI assistant">
        <span class="codicon codicon-send"></span>
        <span class="btn-text">Send to AI</span>
      </button>
    </span>
  </div>
  <div class="row">
    <span class="muted" id="ai-provider-status">
      Provider: <span id="ai-provider-name">Not configured</span>
    </span>
  </div>
</div>
```

#### 3.7.2 JavaScript патч

**Патч для файла: `media/control.js`**

В функции `window.addEventListener("message", ...)` добавить обработку нового типа сообщения:

```javascript
// В функции обработки сообщений, после обработки msg.type === "data":

if (msg?.type === "aiProviderStatus") {
  // Обновляем отображение текущего провайдера
  const nameEl = document.getElementById("ai-provider-name");
  if (nameEl) {
    nameEl.textContent = msg.providerName || "Not configured";
  }
}
```

#### 3.7.3 TypeScript патч для ControlPanelView

**Патч для файла: `src/views/ControlPanelView.ts`**

```typescript
// Добавить импорт в начало
import { getAiService } from "../extension";

// В методе resolveWebviewView, после bootstrapOnce():
this.updateAiProviderStatus();

// В обработчике сообщений (onDidReceiveMessage), добавить новый case:
case "sendToAI":
  await this.onSendToAI();
  break;

// Добавить новые методы в класс:

/**
 * Обновить отображение текущего AI провайдера
 */
private updateAiProviderStatus() {
  const config = vscode.workspace.getConfiguration();
  const providerId = config.get<string>("lg.ai.provider");
  
  if (!providerId) {
    this.post({ type: "aiProviderStatus", providerName: "Not configured" });
    return;
  }
  
  const aiService = getAiService(this.context);
  const providerName = aiService.getProviderName(providerId);
  
  this.post({ type: "aiProviderStatus", providerName });
}

/**
 * Обработчик кнопки "Send to AI"
 */
private async onSendToAI() {
  const state = this.getState();
  const config = vscode.workspace.getConfiguration();
  const providerId = config.get<string>("lg.ai.provider");
  
  if (!providerId) {
    const choice = await vscode.window.showErrorMessage(
      "No AI provider configured.",
      "Open Settings",
      "Cancel"
    );
    
    if (choice === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
    }
    return;
  }
  
  // Определяем, что отправлять: контекст или секцию
  let content: string;
  let targetName: string;
  
  if (state.template) {
    // Отправляем контекст
    targetName = state.template;
    const options = this.getFullCliOptions(state);
    
    content = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating context '${targetName}'...`,
        cancellable: false
      },
      () => runContext(targetName, options)
    );
  } else {
    // Отправляем секцию
    targetName = state.section || "all";
    const params = {
      section: state.section,
      ...this.getTokenizationParams(state),
      ...this.getAdaptiveParams(state)
    };
    
    content = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating listing for '${targetName}'...`,
        cancellable: false
      },
      () => runListing(params)
    );
  }
  
  // Отправляем в AI
  const aiService = getAiService(this.context);
  const providerName = aiService.getProviderName(providerId);
  
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Sending to ${providerName}...`,
        cancellable: false
      },
      () => aiService.sendToProvider(providerId, content)
    );
  } catch (error: any) {
    const choice = await vscode.window.showErrorMessage(
      `Failed to send to ${providerName}: ${error.message}`,
      "Open Settings",
      "Copy to Clipboard",
      "Cancel"
    );
    
    if (choice === "Open Settings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "lg.ai.provider");
    } else if (choice === "Copy to Clipboard") {
      await aiService.sendToProvider("clipboard", content);
    }
  }
}
```

---

### 3.8 Управление API ключами (для OpenAI)

**Новая команда для настройки API ключа:**

**Патч для файла: `src/extension.ts`**

В секции регистрации команд добавить:

```typescript
vscode.commands.registerCommand("lg.ai.configureOpenAI", async () => {
  const currentKey = await context.secrets.get("lg.openai.apiKey");
  
  const input = await vscode.window.showInputBox({
    prompt: "Enter your OpenAI API Key",
    password: true,
    value: currentKey ? "••••••••••••" : "",
    placeHolder: "sk-..."
  });
  
  if (input === undefined) {
    return; // cancelled
  }
  
  if (!input || input === "••••••••••••") {
    return; // no change
  }
  
  await context.secrets.store("lg.openai.apiKey", input);
  vscode.window.showInformationMessage("OpenAI API key saved successfully");
})
```

Добавить команду в `package.json`:

```json
{
  "command": "lg.ai.configureOpenAI",
  "title": "LG: Configure OpenAI API Key"
}
```
