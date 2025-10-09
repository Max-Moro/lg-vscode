# LG UI Components Library — Quick Reference

## 🎯 Purpose

Modular, reusable UI component library for Listing Generator VS Code Extension.

**Goal**: Separate presentation layer from business logic.

---

## 📦 Available Components

| Component | Description | API |
|-----------|-------------|-----|
| **Button** | Primary/secondary buttons with icons | `new Button(options)` or `enhanceButton(el)` |
| **Select** | Themed dropdown | `fillSelect(el, items)` or `enhanceSelect(el)` |
| **Input** | Basic text input | `enhanceInput(el)` |
| **Number** | Number input (no spinners) | `enhanceNumber(el, options)` |
| **Autosuggest** | Combobox with autocomplete | `createAutosuggest(el, options)` |
| **Textarea** | Resizable text area | `enhanceTextarea(el)` |
| **ChatInput** | Auto-expanding AI-style input | `createChatInput(el, options)` |

---

## 🛠️ Utils

| Util | Purpose | Key Methods |
|------|---------|-------------|
| **DOM** | Query & manipulate elements | `qs()`, `qsa()`, `create()`, `remove()` |
| **Events** | Event handling | `on()`, `delegate()`, `debounce()`, `throttle()` |
| **State** | VS Code API integration | `get()`, `set()`, `merge()`, `post()` |

---

## 🚀 Quick Start

### 1. Build

```bash
npm run build:ui
```

### 2. Include in HTML

```html
<link rel="stylesheet" href="{{lgUiCssUri}}">
<script src="{{lgUiJsUri}}"></script>
```

### 3. Use in JS

```javascript
// Global LGUI namespace
const autosuggest = LGUI.createAutosuggest('#input', {
  items: ['item1', 'item2'],
  onSelect: (value) => console.log(value)
});
```

---

## 📖 Documentation

- **[SUMMARY.md](./SUMMARY.md)** — Implementation summary
- **[README.md](./README.md)** — Full documentation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System design
- **[MIGRATION.md](./MIGRATION.md)** — Migration guide

---

## 📁 Structure

```
media/ui/
├── core/              # Tokens, reset
├── utils/             # DOM, Events, State
├── components/        # 7 components (each in folder)
└── dist/              # Auto-generated bundles
    ├── lg-ui.css      (~13 KB)
    └── lg-ui.js       (~22 KB)
```

---

## 🔄 Workflow

```
1. Edit component → 2. npm run build:ui → 3. Test in Extension Host
```

---

## 💡 Key Principle

> **Separation of Concerns**
> 
> Components = Reusable UI  
> Views = Business Logic + Component Assembly

---

Built for **Listing Generator VS Code Extension** 🚀
