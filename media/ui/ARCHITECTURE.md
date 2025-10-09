# LG UI Components — Architecture Overview

## 📁 Directory Structure

```
media/ui/
├── README.md               # Main documentation
├── MIGRATION.md            # Migration guide from old code
├── .gitignore              # Ignore dist/ folder
│
├── core/                   # Core styles & utilities
│   ├── tokens.css          # Design tokens (CSS variables)
│   └── reset.css           # Base reset/normalize
│
├── utils/                  # JavaScript utilities
│   ├── dom.js              # DOM helpers (qs, qsa, create, etc.)
│   ├── events.js           # Event helpers (on, delegate, debounce, etc.)
│   └── state.js            # State management (VS Code API integration)
│
├── components/             # UI Components (modular)
│   │
│   ├── button/
│   │   ├── button.css      # Button styles
│   │   ├── button.js       # Button component class
│   │   └── README.md       # Button documentation (optional)
│   │
│   ├── select/
│   │   ├── select.css
│   │   ├── select.js
│   │   └── README.md
│   │
│   ├── input/
│   │   ├── input.css
│   │   └── input.js
│   │
│   ├── number/
│   │   ├── number.css
│   │   └── number.js
│   │
│   ├── autosuggest/
│   │   ├── autosuggest.css
│   │   ├── autosuggest.js
│   │   └── README.md       # Detailed autosuggest docs
│   │
│   ├── textarea/
│   │   ├── textarea.css
│   │   └── textarea.js
│   │
│   └── chat-input/
│       ├── chat-input.css
│       ├── chat-input.js
│       └── README.md
│
└── dist/                   # Auto-generated bundles (gitignored)
    ├── lg-ui.css           # Combined CSS bundle
    └── lg-ui.js            # Combined JS bundle
```

## 🔧 Build System

### Build Script: `src/build-ui.ts`

TypeScript script that:
1. Reads all CSS files from `core/` and `components/`
2. Concatenates them in proper order
3. Reads all JS files from `utils/` and `components/`
4. Removes ES6 import/export statements
5. Wraps everything in IIFE with global `LGUI` namespace
6. Writes to `dist/lg-ui.css` and `dist/lg-ui.js`

### Commands

```bash
# Build UI bundle (manual)
npm run build:ui

# Build everything (extension + UI)
npm run build

# Watch mode (TypeScript only)
npm run watch

# Pre-publish (runs before vsce package)
npm run vscode:prepublish
```

## 🎨 Component Philosophy

### 1. Separation of Concerns
- **CSS**: Pure presentation (no business logic)
- **JS**: Behavior and interaction (no styling)
- **HTML**: Semantic structure (provided by business code)

### 2. Modular Design
Each component is:
- Self-contained (own folder)
- Independently testable
- Documented (optional README)
- Reusable across different views

### 3. VS Code Theme Integration
All components use VS Code CSS variables:
- `--vscode-input-background`
- `--vscode-button-background`
- `--vscode-focusBorder`
- etc.

### 4. Progressive Enhancement
Components can work in two modes:
1. **Class-based** (programmatic): `new Button({ ... })`
2. **Enhancement** (declarative): `enhanceButton(element)`

## 🚀 Usage Patterns

### Pattern 1: Programmatic Creation
```javascript
const button = new LGUI.Button({
  text: 'Generate',
  icon: 'play',
  variant: 'primary',
  onClick: () => generateListing()
});
container.appendChild(button.element);
```

### Pattern 2: Enhance Existing HTML
```html
<!-- HTML -->
<button id="my-btn" data-action="generate">Generate</button>
```

```javascript
// JS
const btn = document.getElementById('my-btn');
LGUI.enhanceButton(btn, { variant: 'primary' });
```

### Pattern 3: Complex Components (Autosuggest)
```javascript
const autosuggest = LGUI.createAutosuggest('#encoder', {
  items: encoders,
  getValue: (item) => item.name,
  isItemCached: (item) => item.cached,
  onSelect: (value) => handleEncoderChange(value)
});

// Update items dynamically
autosuggest.setItems(newEncoders);
```

## 📦 Bundle Output

### `dist/lg-ui.css` (~8-12 KB)
Contains:
1. Design tokens
2. Base reset
3. All component styles
4. Responsive utilities

### `dist/lg-ui.js` (~15-20 KB)
Contains:
1. Utils (DOM, Events, State)
2. All component classes
3. Global `LGUI` namespace
4. Helper functions

## 🔌 Integration with Views

### Before (old monolithic approach):
```html
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="control.css">
<script src="common-ui.js"></script>
<script src="control.js"></script>
```

### After (modular components):
```html
<link rel="stylesheet" href="lg-ui.css">
<script src="lg-ui.js"></script>
<script src="control.js"></script> <!-- Business logic only -->
```

## 🎯 Benefits

✅ **Modularity**: Easy to add/remove components  
✅ **Maintainability**: Clear separation of concerns  
✅ **Reusability**: Same components across all views  
✅ **Type Safety**: TypeScript build script  
✅ **Performance**: Single CSS/JS bundle per page  
✅ **Developer Experience**: Clear API, good docs  
✅ **Theme Support**: Auto-adapts to VS Code themes  
✅ **Accessibility**: Focus management, ARIA support  

## 🧪 Testing Strategy

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test components in webview context
3. **Visual Tests**: Test with different VS Code themes
4. **Manual Tests**: Test in Extension Development Host

## 📚 Documentation

- `README.md` — Overview and quick start
- `MIGRATION.md` — Guide for migrating existing code
- `components/<name>/README.md` — Detailed component docs
- Inline JSDoc comments in code

## 🔄 Development Workflow

1. Create new component in `components/<name>/`
2. Add CSS and JS files
3. Update `src/build-ui.ts` COMPONENTS array
4. Run `npm run build:ui`
5. Test in Extension Development Host
6. Document in component README (optional)
7. Integrate into business views

## 🎓 Best Practices

1. **Naming**: Use `lg-` prefix for all classes
2. **Structure**: One component = one folder
3. **Dependencies**: Components should be self-contained
4. **State**: Use `State` util for persistence
5. **Events**: Use `Events` util for listeners
6. **Cleanup**: Always implement `destroy()` method
7. **Documentation**: Add JSDoc comments
8. **Testing**: Test before committing
