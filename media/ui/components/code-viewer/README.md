# Code Viewer Component

Monospace textarea component for displaying raw JSON or code in debug views.

## Purpose

Display raw JSON data or code snippets in a read-only monospace textarea, typically used in debug sections with `<details>` tags.

## Usage

### HTML

```html
<details>
  <summary>Raw JSON</summary>
  <textarea class="lg-code-viewer" readonly>${escapedJSON}</textarea>
</details>
```

### JavaScript

```javascript
const jsonData = { foo: 'bar', nested: { value: 123 } };
const textarea = `<textarea class="lg-code-viewer">${esc(JSON.stringify(jsonData, null, 2))}</textarea>`;
```

## Features

- ✅ Fixed size with resize handle (480x300px default)
- ✅ Monospace font (VS Code editor font)
- ✅ Pre-formatted text (`white-space: pre`)
- ✅ Theme-aware colors (VS Code editor background/foreground)
- ✅ Focus border styling
- ✅ Disabled state support

## Styling

The component uses:
- `var(--vscode-editor-background)` — Background color
- `var(--vscode-foreground)` — Text color
- `var(--vscode-editor-font-family, monospace)` — Font
- `var(--vscode-focusBorder)` — Focus outline
- `var(--vscode-editorIndentGuide-background)` — Border color

## Migration from Legacy

**Before:**
```html
<textarea class="rawjson">${data}</textarea>
```

**After:**
```html
<textarea class="lg-code-viewer">${data}</textarea>
```

## Used In

- `media/doctor.js` — Display raw configuration JSON
- `media/stats.js` — Display raw statistics data

## Related Components

- `.lg-textarea` — Regular textarea input
- `.lg-chat-input` — Auto-expanding chat-style textarea
