# LG UI Components — Architecture Guide

**Listing Generator VS Code Extension UI Component Library**

---

## 📋 Overview

This directory contains a **modular component library** for all webview UI in the Listing Generator extension. The library provides reusable, theme-aware components with a unified API.

**Key Principles:**
- ✅ **Separation of Concerns**: Components (here) vs Business Logic (views)
- ✅ **Single Source of Truth**: All UI components in `components/`, not scattered
- ✅ **Theme Integration**: Auto-adapts to VS Code light/dark/high-contrast themes
- ✅ **Modular Architecture**: Each component in its own folder with CSS + JS

---

## 📁 Directory Structure

```
media/ui/
├── components/          # UI Components (8 total)
│   ├── button/          # Primary/secondary buttons
│   ├── select/          # Themed dropdown
│   ├── input/           # Text input
│   ├── number/          # Number input (no spinners)
│   ├── autosuggest/     # Combobox with autocomplete
│   ├── textarea/        # Resizable textarea
│   ├── chat-input/      # Auto-expanding AI-style input
│   └── code-viewer/     # Monospace debug viewer
│
├── core/                # Foundation
│   ├── tokens.css       # Design tokens (spacing, colors, z-index)
│   └── reset.css        # Minimal CSS reset
│
├── utils/               # JavaScript Utilities
│   ├── dom.js           # Query, create, manipulate elements
│   ├── events.js        # Event delegation, debounce, throttle
│   └── state.js         # VS Code API integration, persistence
│
└── dist/                # Auto-generated bundles (gitignored)
    ├── lg-ui.css        # Combined CSS (~13.6 KB)
    └── lg-ui.js         # Combined JS (~22 KB)
```

---

## 🔧 Build System

### Build Script

`src/build-ui.ts` — TypeScript script that:
1. Concatenates all CSS from `core/` and `components/`
2. Concatenates all JS from `utils/` and `components/`
3. Wraps JS in IIFE with global `LGUI` namespace
4. Outputs to `dist/lg-ui.css` and `dist/lg-ui.js`

### Commands

```bash
# Build UI components only
npm run build:ui

# Build extension + UI components
npm run build

# Watch mode (TypeScript only, not UI)
npm run watch

# Pre-publish (includes UI build)
npm run vscode:prepublish
```

**Important**: Run `npm run build:ui` after modifying any component CSS/JS!

---

## 🎨 Component Library

### Available Components

| Component | Class | Purpose |
|-----------|-------|---------|
| **Button** | `.lg-btn`, `.lg-btn--primary` | Primary/secondary action buttons |
| **Select** | `.lg-select` | Themed dropdown select |
| **Input** | `.lg-input` | Text input field |
| **Number** | `.lg-input--number` | Number input without spinners |
| **Autosuggest** | `.lg-autosuggest` | Combobox with autocomplete + custom input |
| **Textarea** | `.lg-textarea` | Resizable multiline text |
| **Chat Input** | `.lg-chat-input` | Auto-expanding textarea (AI-style) |
| **Code Viewer** | `.lg-code-viewer` | Monospace textarea for JSON/code |

### Design Tokens

All components use CSS variables from `core/tokens.css`:

**Spacing:**
- `--lg-space-xs` (4px), `--lg-space-sm` (8px), `--lg-space-md` (12px), `--lg-space-lg` (16px)

**Border Radius:**
- `--lg-radius-sm` (4px), `--lg-radius-md` (6px), `--lg-radius-lg` (8px)

**Transitions:**
- `--lg-transition-fast` (0.15s ease), `--lg-transition-normal` (0.2s ease)

**Z-index:**
- `--lg-z-dropdown` (1000), `--lg-z-modal` (2000), `--lg-z-tooltip` (3000)

**Font Sizes:**
- `--lg-font-sm` (11px), `--lg-font-md` (12px), `--lg-font-lg` (13px)

---

## 🚀 Usage Guide

### 1. Include in HTML Template

```typescript
// In TypeScript view provider (e.g., ControlPanelView.ts)
private buildHtml(view: vscode.WebviewView): string {
  const { buildHtml, lgUiUri } = require("../webview/webviewKit");
  
  return buildHtml(view.webview, "control.html", {
    lgUiCssUri: lgUiUri(view.webview, 'lg-ui.css'),
    lgUiJsUri: lgUiUri(view.webview, 'lg-ui.js'),
    controlJsUri: mediaUri(view.webview, "control.js"),
  });
}
```

```html
<!-- In HTML template (e.g., control.html) -->
<link rel="stylesheet" href="{{lgUiCssUri}}">
<script src="{{lgUiJsUri}}"></script>
<script src="{{controlJsUri}}"></script>
```

### 2. Use Components in JavaScript

**Global Namespace:**
```javascript
/* global LGUI */
const { DOM, Events, State } = LGUI;
```

**Basic Components:**
```html
<!-- Button (declarative - just use class in HTML) -->
<button class="lg-btn lg-btn--primary">Primary Action</button>
<button class="lg-btn">Secondary Action</button>

<!-- Select (declarative) -->
<select class="lg-select" id="mySelect">
  <option>Option 1</option>
</select>

<!-- Input (declarative) -->
<input class="lg-input" type="text" placeholder="Enter value">

<!-- Number (declarative) -->
<input class="lg-input lg-input--number" type="number">
```

**Complex Components (Autosuggest):**
```javascript
// Create autosuggest on existing input
const encoderInput = DOM.qs('#encoder');
const autosuggest = LGUI.createAutosuggest(encoderInput, {
  items: [
    { name: 'cl100k_base', cached: true },
    { name: 'gpt-4o', cached: false }
  ],
  getValue: (item) => item.name,
  isItemCached: (item) => item.cached,
  onSelect: (value) => {
    State.merge({ encoder: value });
    State.post('setState', { state: { encoder: value } });
  }
});

// Update items dynamically
autosuggest.setItems(newEncoders);
```

**Chat Input:**
```html
<!-- Auto-expanding textarea -->
<textarea class="lg-chat-input" 
          id="taskText"
          placeholder="Describe current task"
          rows="1"></textarea>
```

**Code Viewer:**
```html
<!-- Monospace textarea for JSON/code -->
<details>
  <summary>Raw JSON</summary>
  <textarea class="lg-code-viewer" readonly>${escapedJSON}</textarea>
</details>
```

### 3. Utilities API

**DOM Utilities:**
```javascript
// Query
const btn = DOM.qs('#myButton');                    // querySelector
const btns = DOM.qsa('.lg-btn');                    // querySelectorAll (array)

// Create
const div = DOM.create('div', { 
  class: 'container',
  id: 'my-container'
});

// Remove
DOM.remove(element);
```

**Event Utilities:**
```javascript
// Event delegation
Events.delegate(document, '.lg-btn', 'click', (element) => {
  console.log('Button clicked:', element);
});

// Debounce
const debouncedSearch = Events.debounce((query) => {
  performSearch(query);
}, 300);

// Throttle
const throttledScroll = Events.throttle(() => {
  updateScrollPosition();
}, 100);
```

**State Utilities:**
```javascript
// Get VS Code API (cached)
const vscode = State.getVSCode();

// Post message to extension
State.post('myAction', { data: 'value' });

// State management
const currentState = State.get('myKey');
State.set('myKey', 'newValue');
State.merge({ key1: 'val1', key2: 'val2' });
```

---

## 🎯 Architecture Principles

### What Belongs in `media/ui/components/`?

**✅ Extract to component library IF:**
1. Used in **2+ views** OR highly reusable
2. **Self-contained** visual/interactive unit
3. Has **no business logic coupling**
4. Pure presentation (styling + basic interaction)

**Examples**: Buttons, inputs, selects, modals, dropdowns

### What Stays in View CSS (e.g., `control.css`)?

**✅ Keep in view-specific CSS IF:**
1. **Layout system** (containers, grids, spacing)
2. **View-specific features** (tags panel, mode sets)
3. **Business logic styling** (domain-specific)
4. Used in **1 view only**

**Examples**: `.block`, `.row`, `.cluster`, `.tags-panel`

### What Goes in `media/base.css`?

**✅ Base utilities only:**
- Typography base (body, h2)
- Utility classes (`.card`, `.pill`, `.muted`)
- Table styles
- Global CSS variables

**❌ NO UI components** in `base.css`!

---

## 🔄 Adding New Components

### Step-by-Step Guide

**1. Create Component Folder:**
```bash
mkdir media/ui/components/my-component
```

**2. Create CSS File:**
```css
/* media/ui/components/my-component/my-component.css */

.lg-my-component {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--lg-radius-md);
  padding: var(--lg-space-md);
  transition: border-color var(--lg-transition-fast);
}

.lg-my-component:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}
```

**3. Create JS File (Optional):**
```javascript
/* media/ui/components/my-component/my-component.js */

/**
 * Create My Component
 * @param {HTMLElement|string} target - Element or selector
 * @param {Object} options - Component options
 */
LGUI.createMyComponent = function(target, options = {}) {
  const element = typeof target === 'string' 
    ? LGUI.DOM.qs(target) 
    : target;
  
  // Component logic here
  
  return {
    element,
    destroy: () => {
      // Cleanup
    }
  };
};
```

**4. Update Build Script:**
```typescript
// src/build-ui.ts
const COMPONENTS = [
  'button',
  'select',
  'input',
  'number',
  'autosuggest',
  'textarea',
  'chat-input',
  'code-viewer',
  'my-component'  // ← Add here
];
```

**5. Build and Test:**
```bash
npm run build:ui
# Test in Extension Development Host (F5)
```

**6. Document (Optional):**
```markdown
<!-- media/ui/components/my-component/README.md -->
# My Component

Description, usage examples, API reference.
```

---

## 🧪 Testing

### Manual Testing

1. Make changes to component CSS/JS
2. Run `npm run build:ui`
3. Press **F5** to launch Extension Development Host
4. Test in all views (Control Panel, Stats, Doctor)
5. Test theme switching (light/dark/high-contrast)

### Validation Checklist

- [ ] Component works in all views where used
- [ ] Theme colors adapt correctly (light/dark/high-contrast)
- [ ] Focus states visible and accessible
- [ ] No console errors
- [ ] Responsive behavior works (narrow panels)
- [ ] State persistence works (if applicable)

---

## 📚 Component Documentation

### Detailed Docs

Some complex components have detailed README files:
- `components/autosuggest/README.md` — Autocomplete API, keyboard navigation
- `components/code-viewer/README.md` — Debug textarea usage

### Inline Documentation

All JavaScript utilities and components have JSDoc comments. Use your IDE's intellisense for API hints.

---

## 🎓 Best Practices

### Naming Conventions

**CSS Classes:**
- Component: `.lg-component-name`
- Variant: `.lg-component-name--variant`
- Element: `.lg-component-name__element`
- State: `.lg-component-name.is-active`

**JavaScript:**
- Global namespace: `LGUI`
- Utilities: `LGUI.DOM`, `LGUI.Events`, `LGUI.State`
- Factory functions: `LGUI.createComponent()`
- Classes: `new LGUI.Component()`

### Component Design

1. **Use VS Code CSS variables** for all colors/borders
2. **Use design tokens** from `tokens.css` for spacing/transitions
3. **Implement focus states** for accessibility
4. **Support disabled state** where applicable
5. **Clean up event listeners** in destroy methods

### Code Organization

```javascript
/* global LGUI */
const { DOM, Events, State } = LGUI;

// 1. Get VS Code API
const vscode = State.getVSCode();

// 2. Query DOM
const myButton = DOM.qs('#my-button');

// 3. Setup event handlers
Events.delegate(document, '.lg-btn', 'click', (el) => {
  handleButtonClick(el);
});

// 4. Initialize components
const autosuggest = LGUI.createAutosuggest('#input', options);

// 5. State management
State.merge({ key: value });
```

---

## 📦 Bundle Information

### Current Size

| File | Size | Content |
|------|------|---------|
| `lg-ui.css` | 13.6 KB | 8 components + tokens + reset |
| `lg-ui.js` | 22.0 KB | Utilities + component factories |
| **Total** | **35.6 KB** | Unminified, uncompressed |

### Load Time

Bundles are loaded once per webview, cached by VS Code. Typical load time: <10ms.

---

## 🔍 Troubleshooting

### Component Not Styled

**Symptom**: Component has no styling  
**Causes**:
1. Forgot to run `npm run build:ui` after CSS changes
2. HTML template not loading `lgUiCssUri`
3. Typo in class name (must start with `lg-`)

**Fix**: Rebuild and verify template includes bundles.

### JavaScript Error "LGUI is not defined"

**Symptom**: Console error about LGUI  
**Causes**:
1. HTML template not loading `lgUiJsUri`
2. Script tag order wrong (lg-ui.js must load before view JS)

**Fix**: Verify script tag order in HTML.

### Autosuggest Not Working

**Symptom**: Dropdown doesn't appear  
**Causes**:
1. Target element not found (wrong selector)
2. Items array empty or malformed
3. Missing `getValue` function

**Fix**: Check console for errors, verify options object.

### Theme Colors Wrong

**Symptom**: Component colors don't match VS Code theme  
**Causes**:
1. Using hardcoded colors instead of CSS variables
2. Missing `var(--vscode-*)` references

**Fix**: Replace all hardcoded colors with VS Code variables.

---

## 📖 VS Code CSS Variables Reference

### Colors

**Editor:**
- `--vscode-editor-background`
- `--vscode-editor-foreground`
- `--vscode-editorWidget-background`
- `--vscode-editorWidget-border`
- `--vscode-editorIndentGuide-background`

**Input:**
- `--vscode-input-background`
- `--vscode-input-foreground`
- `--vscode-input-border`
- `--vscode-input-placeholderForeground`

**Button:**
- `--vscode-button-background`
- `--vscode-button-foreground`
- `--vscode-button-hoverBackground`
- `--vscode-button-secondaryBackground`
- `--vscode-button-secondaryForeground`

**Focus:**
- `--vscode-focusBorder`

**Status:**
- `--vscode-editorWarning-foreground`
- `--vscode-editorError-foreground`
- `--vscode-editorInfo-foreground`

**Text:**
- `--vscode-foreground`
- `--vscode-descriptionForeground`
- `--vscode-disabledForeground`

### Fonts

- `--vscode-font-family` — UI font
- `--vscode-editor-font-family` — Monospace font

---

## 🎯 Summary

**LG UI Components** is a modular, theme-aware component library for VS Code webviews.

**Key Takeaways:**
- ✅ All UI components in `media/ui/components/`
- ✅ Build with `npm run build:ui`
- ✅ Use `.lg-*` classes for components
- ✅ Access via global `LGUI` namespace
- ✅ Theme-aware (VS Code CSS variables)
- ✅ Modular architecture (easy to extend)

**Next Steps:**
1. Explore `components/` folder for examples
2. Read component README files for detailed APIs
3. Try building a new component following the guide above
