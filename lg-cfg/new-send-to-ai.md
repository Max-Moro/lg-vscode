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
