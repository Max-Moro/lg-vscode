# 🎨 LG UI Components Library

Модульная библиотека UI-компонентов для Listing Generator VS Code Extension.

**Принципы**: Модульность • Переиспользование • Автосборка • VS Code Темизация

---

## ⚡ Quick Start

### 1. Build the library

```bash
npm run build:ui
```

This creates:
- `media/ui/dist/lg-ui.css` (~13 KB)
- `media/ui/dist/lg-ui.js` (~22 KB)

### 2. Include in your webview

```html
<link rel="stylesheet" href="{{lgUiCssUri}}">
<script src="{{lgUiJsUri}}"></script>
```

### 3. Use components

```javascript
// All components available under global LGUI namespace
const autosuggest = LGUI.createAutosuggest('#encoder', {
  items: ['cl100k_base', 'gpt-4o', 'o200k_base'],
  onSelect: (value) => console.log('Selected:', value)
});
```

---

## 📖 Architecture

```
media/ui/
├── core/
│   ├── tokens.css          # Design tokens (переменные CSS)
│   └── reset.css           # Base reset/normalize
├── utils/
│   ├── dom.js              # DOM utilities
│   ├── events.js           # Event helpers
│   └── state.js            # State management
├── components/
│   ├── button/
│   │   ├── button.css
│   │   └── button.js
│   ├── select/
│   │   ├── select.css
│   │   └── select.js
│   ├── input/
│   │   ├── input.css
│   │   └── input.js
│   ├── number/
│   │   ├── number.css
│   │   └── number.js
│   ├── autosuggest/
│   │   ├── autosuggest.css
│   │   ├── autosuggest.js
│   │   └── README.md
│   ├── textarea/
│   │   ├── textarea.css
│   │   └── textarea.js
│   └── chat-input/
│       ├── chat-input.css
│       └── chat-input.js
└── dist/
    ├── lg-ui.css           # Собранный CSS (auto-generated)
    └── lg-ui.js            # Собранный JS (auto-generated)
```

## Принципы

1. **Модульность**: каждый компонент в своей папке
2. **Переиспользование**: компоненты не зависят от бизнес-логики
3. **Автосборка**: build script объединяет все в dist/
4. **VS Code темы**: используем CSS-переменные VS Code

## Использование

```html
<!-- В HTML-шаблонах -->
<link rel="stylesheet" href="{{lgUiCssUri}}">
<script src="{{lgUiJsUri}}"></script>

<!-- Компоненты доступны через LGUI namespace -->
<script>
  const autosuggest = LGUI.createAutosuggest('#my-input', options);
</script>
```

## Build

```bash
npm run build:ui
```

Запускает `src/build-ui.ts`, который:
- Объединяет все CSS из components/ в dist/lg-ui.css
- Объединяет все JS из components/ в dist/lg-ui.js
- Добавляет sourcemaps для отладки
