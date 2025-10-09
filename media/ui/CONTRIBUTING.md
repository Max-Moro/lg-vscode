# Adding New Components — Developer Guide

## 📋 Steps to Add a New Component

### 1. Create Component Folder

```bash
mkdir media/ui/components/my-component
```

### 2. Create CSS File

`media/ui/components/my-component/my-component.css`:

```css
/**
 * My Component Styles
 */

.lg-my-component {
  /* Use design tokens from tokens.css */
  padding: var(--lg-space-md);
  border-radius: var(--lg-radius-sm);
  
  /* Use VS Code theme variables */
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  
  /* Transitions */
  transition: border-color var(--lg-transition-fast);
}

.lg-my-component:hover {
  border-color: var(--vscode-focusBorder);
}

.lg-my-component--variant {
  /* Variant styles */
}
```

### 3. Create JS File

`media/ui/components/my-component/my-component.js`:

```javascript
/**
 * My Component
 */

import { DOM } from '../../utils/dom.js';
import { Events } from '../../utils/events.js';

export class MyComponent {
  constructor(element, options = {}) {
    this.element = typeof element === 'string' ? DOM.qs(element) : element;
    
    if (!this.element) {
      throw new Error('MyComponent: element not found');
    }

    this.options = {
      // Default options
      variant: 'default',
      disabled: false,
      onChange: null,
      ...options
    };

    this.cleanups = [];
    this.init();
  }

  init() {
    // Add base class
    this.element.classList.add('lg-my-component');
    
    // Apply variant
    if (this.options.variant !== 'default') {
      this.element.classList.add(`lg-my-component--${this.options.variant}`);
    }

    this.bindEvents();
  }

  bindEvents() {
    // Add event listeners
    if (this.options.onChange) {
      this.cleanups.push(
        Events.on(this.element, 'change', () => {
          this.options.onChange(this.getValue());
        })
      );
    }
  }

  getValue() {
    // Get component value
    return this.element.value;
  }

  setValue(value) {
    // Set component value
    this.element.value = value;
  }

  setDisabled(disabled) {
    this.options.disabled = disabled;
    this.element.disabled = disabled;
  }

  destroy() {
    // Clean up event listeners
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    
    // Remove classes
    this.element.classList.remove('lg-my-component');
  }
}

/**
 * Factory function for easier usage
 */
export function createMyComponent(element, options) {
  return new MyComponent(element, options);
}

/**
 * Enhance existing element (non-class approach)
 */
export function enhanceMyComponent(element, options = {}) {
  element.classList.add('lg-my-component');
  
  if (options.variant) {
    element.classList.add(`lg-my-component--${options.variant}`);
  }
  
  return element;
}
```

### 4. Add to Build Script

`src/build-ui.ts`:

```typescript
const COMPONENTS = [
  'button',
  'select',
  'input',
  'number',
  'autosuggest',
  'textarea',
  'chat-input',
  'my-component',  // ← Add here
];
```

### 5. Export in Global API

`src/build-ui.ts` (in `buildJS()` function):

```typescript
parts.push('  global.LGUI = {');
parts.push('    // Utils');
parts.push('    DOM,');
parts.push('    Events,');
parts.push('    State,');
parts.push('    // Components');
parts.push('    Button,');
parts.push('    enhanceButton,');
// ... other components ...
parts.push('    MyComponent,');           // ← Add class
parts.push('    createMyComponent,');     // ← Add factory
parts.push('    enhanceMyComponent,');    // ← Add enhancer
parts.push('    // Version');
parts.push('    version: "1.0.0"');
parts.push('  };');
```

### 6. Build

```bash
npm run build:ui
```

### 7. Test

In your webview JS:

```javascript
// Test the component
const myComp = LGUI.createMyComponent('#my-element', {
  variant: 'primary',
  onChange: (value) => console.log('Changed:', value)
});

// Or enhance existing
const el = document.getElementById('existing');
LGUI.enhanceMyComponent(el, { variant: 'secondary' });
```

### 8. (Optional) Add README

`media/ui/components/my-component/README.md`:

```markdown
# My Component

Description of the component.

## Usage

\`\`\`javascript
const comp = LGUI.createMyComponent('#element', {
  variant: 'primary',
  onChange: (value) => console.log(value)
});
\`\`\`

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `variant` | `string` | `'default'` | Component variant |
| `onChange` | `function` | `null` | Change callback |

## Methods

- `getValue()` — Get current value
- `setValue(value)` — Set value
- `destroy()` — Clean up
```

---

## ✅ Checklist

- [ ] Created `components/my-component/` folder
- [ ] Created `my-component.css` with `.lg-my-component` class
- [ ] Created `my-component.js` with class, factory, enhancer
- [ ] Added component to `COMPONENTS` array in `build-ui.ts`
- [ ] Exported in global `LGUI` namespace
- [ ] Ran `npm run build:ui`
- [ ] Tested in Extension Development Host
- [ ] (Optional) Added README

---

## 💡 Best Practices

1. **Naming**: Use `lg-` prefix for all CSS classes
2. **Tokens**: Use design tokens from `tokens.css`
3. **Themes**: Use VS Code CSS variables
4. **Events**: Use `Events` util, store cleanups
5. **Cleanup**: Always implement `destroy()` method
6. **Docs**: Add JSDoc comments
7. **Testing**: Test light/dark themes, high contrast

---

## 📚 Reference

- **Design Tokens**: `core/tokens.css`
- **VS Code Variables**: [Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
- **Utils**: `utils/dom.js`, `utils/events.js`, `utils/state.js`
- **Examples**: See existing components in `components/` folder

---

Happy coding! 🚀
