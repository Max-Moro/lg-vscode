# Migration Guide: Using LG UI Components

## Step 1: Build UI Bundle

```bash
npm run build:ui
```

This creates:
- `media/ui/dist/lg-ui.css`
- `media/ui/dist/lg-ui.js`

## Step 2: Update HTML Templates

### Before (old approach):
```html
<link rel="stylesheet" href="{{baseCssUri}}">
<link rel="stylesheet" href="{{controlCssUri}}">
<script src="{{commonUiJsUri}}"></script>
<script src="{{controlJsUri}}"></script>
```

### After (new approach):
```html
<link rel="stylesheet" href="{{lgUiCssUri}}">
<script src="{{lgUiJsUri}}"></script>
<script src="{{controlJsUri}}"></script>
```

## Step 3: Update TypeScript (webviewKit.ts)

Add helper for lg-ui bundle:

```typescript
export function lgUiUri(webview: vscode.Webview, file: 'lg-ui.css' | 'lg-ui.js'): string {
  const base = vscode.Uri.joinPath(getExtensionUri(), 'media', 'ui', 'dist', file);
  return webview.asWebviewUri(base).toString();
}
```

## Step 4: Update View Providers

### ControlPanelView.ts

```typescript
private buildHtml(view: vscode.WebviewView): string {
  const { buildHtml, lgUiUri } = require("../webview/webviewKit");
  const codicons = toWebviewUri(view.webview, require.resolve("@vscode/codicons/dist/codicon.css"));
  
  return buildHtml(view.webview, "control.html", {
    codiconsUri: codicons,
    lgUiCssUri: lgUiUri(view.webview, 'lg-ui.css'),
    lgUiJsUri: lgUiUri(view.webview, 'lg-ui.js'),
    controlJsUri: mediaUri(view.webview, "control.js"),
  });
}
```

## Step 5: Migrate control.js

### Old code (direct DOM manipulation):
```javascript
const input = document.getElementById('encoder');
input.addEventListener('input', ...);
```

### New code (using LGUI components):
```javascript
/* global LGUI */

// Create autosuggest
const encoderInput = document.getElementById('encoder');
const autosuggest = LGUI.createAutosuggest(encoderInput, {
  items: encoders,
  getValue: (item) => item.name,
  isItemCached: (item) => item.cached,
  onSelect: (value) => {
    const patch = { encoder: value };
    LGUI.State.merge(patch);
    LGUI.State.post('setState', { state: patch });
  }
});

// Update items when they change
window.addEventListener('message', (e) => {
  if (e.data?.type === 'encoders') {
    autosuggest.setItems(e.data.encoders);
  }
});
```

### Enhance existing elements:
```javascript
// Buttons
const buttons = document.querySelectorAll('[data-action]');
buttons.forEach(btn => LGUI.enhanceButton(btn, { variant: 'default' }));

// Selects
const selects = document.querySelectorAll('select');
selects.forEach(sel => LGUI.enhanceSelect(sel));

// Number inputs
const numberInput = document.getElementById('ctxLimit');
LGUI.enhanceNumber(numberInput, { min: 1000, max: 2000000 });

// Chat input
const taskText = document.getElementById('taskText');
const chatInput = LGUI.createChatInput(taskText, {
  placeholder: 'Describe current task',
  onInput: (value) => {
    LGUI.State.merge({ taskText: value });
    LGUI.State.post('setState', { state: { taskText: value } });
  }
});
```

## Step 6: Remove Old Styles

After migration, you can remove component-specific styles from:
- `media/control.css` (keep only layout/structure)
- `media/base.css` (keep only generic utilities)

## Step 7: Testing

1. Run build: `npm run build:ui`
2. Test in Extension Development Host (F5)
3. Verify all components work correctly
4. Check theme switching (light/dark/high contrast)

## Benefits

✅ **Modular**: Each component in its own folder  
✅ **Reusable**: Same components across control.html, stats.html, doctor.html  
✅ **Maintainable**: Easy to update/add components  
✅ **Type-safe**: TypeScript build script  
✅ **Testable**: Components can be tested independently  
✅ **Documented**: Each component has README  

## Component API Examples

### Autosuggest
```javascript
const autosuggest = LGUI.createAutosuggest('#my-input', {
  items: ['apple', 'banana', 'cherry'],
  onSelect: (value) => console.log(value)
});
autosuggest.setItems(newItems); // Update dynamically
```

### Button
```javascript
const button = new LGUI.Button({
  text: 'Click Me',
  icon: 'play',
  variant: 'primary',
  onClick: () => console.log('Clicked!')
});
document.body.appendChild(button.element);
```

### ChatInput
```javascript
const chatInput = LGUI.createChatInput('#taskText', {
  placeholder: 'Enter task...',
  onInput: (value) => console.log('Input:', value)
});
```
