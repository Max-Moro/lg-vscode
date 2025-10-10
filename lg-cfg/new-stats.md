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
