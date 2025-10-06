# ТЗ: Task Context Field — VS Code Extension UI

## Обзор

Добавление UI-компонента "Task Context Field" в Control Panel и Stats Webview для ввода финальных инструкций, которые передаются в CLI через аргумент `--task`.

## Цель

Предоставить удобный интерфейс для быстрого добавления описания текущей задачи к генерируемым контекстам без необходимости ручного редактирования файлов.

---

## UI Components

### Control Panel — Task Context Field

**Расположение:** В самом верху блока "AI Contexts", над Template selector и кнопками.

**Визуальная структура:**

```
┌─ AI Contexts ────────────────────────────────────┐
│ ┌─ Task Context ──────────────────────────────┐  │
│ │ [Многострочное текстовое поле (textarea)]   │  │
│ │ [Placeholder: "Describe current task"]   │  │
│ │ [Auto-resize: 2-10 строк]                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ Template: [Dropdown ▼]                            │
│ [Send to AI] [Generate Context] [Show Stats]     │
└───────────────────────────────────────────────────┘
```

### Stats Webview — Task Context Field

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

## CLI Integration

Что сейчас поддерживает CLI

```bash
# Рендерим контекст с описанием текущей задачи
lg render ctx:dev --task "Реализовать кеширование результатов"

# Многострочная задача через stdin
echo -e "Задачи:\n- Исправить баг #123\n- Добавить тесты" | lg render ctx:dev --task -

# Задача из файла
lg render ctx:dev --task @.current-task.txt
```

