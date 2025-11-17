# Autosuggest Component

Combobox with autocomplete and support for arbitrary user input.

## Features

- ✅ Auto-filtering of list on input
- ✅ Keyboard navigation (Arrow Up/Down, Enter, Escape)
- ✅ Support for arbitrary input (not just from list)
- ✅ Cached items indication
- ✅ Lazy loading (asynchronous items loading)
- ✅ Custom filtering function
- ✅ VS Code theming
- ✅ Dropdown positioned via `position: fixed` and doesn't affect parent layout
- ✅ Dropdown automatically repositions on scroll/resize

## Usage

```javascript
import { createAutosuggest } from './autosuggest.js';

// Simple usage
const autosuggest = createAutosuggest('#my-input', {
  items: ['apple', 'banana', 'cherry'],
  placeholder: 'Select or type...',
  onSelect: (value) => console.log('Selected:', value),
  onChange: (value) => console.log('Input changed:', value)
});

// Advanced usage with objects
const autosuggest = createAutosuggest('#encoder-input', {
  items: [
    { name: 'cl100k_base', cached: true },
    { name: 'gpt-4o', cached: false },
    { name: 'custom-encoder', cached: false }
  ],
  getValue: (item) => item.name,
  isItemCached: (item) => item.cached,
  minChars: 1,
  onSelect: (value) => {
    // Handle selection
  }
});

// Update items dynamically (e.g., after fetching from server)
autosuggest.setItems(newItems);

// Show loading state
autosuggest.setLoading(true);
fetch('/api/encoders')
  .then(res => res.json())
  .then(data => {
    autosuggest.setItems(data);
    autosuggest.setLoading(false);
  });
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `items` | `Array<string \| object>` | `[]` | List of elements for autocomplete |
| `placeholder` | `string` | `''` | Placeholder for input |
| `getValue` | `function` | `item => item` | Function to extract value from item |
| `isItemCached` | `function` | `item => item.cached` | Check if item is cached |
| `onSelect` | `function` | `null` | Callback when selecting item from list |
| `onChange` | `function` | `null` | Callback when input value changes |
| `filterFn` | `function` | `null` | Custom filtering function |
| `minChars` | `number` | `0` | Minimum number of characters to show dropdown |

## Methods

- `setItems(items)` — update list of items
- `setLoading(loading)` — show/hide loading indicator
- `open()` — open dropdown
- `close()` — close dropdown
- `destroy()` — remove component

## HTML Structure

```html
<!-- Container (in normal flow) -->
<div class="lg-autosuggest lg-autosuggest--open">
  <input type="text" class="lg-autosuggest__input" />
  <span class="lg-autosuggest__indicator codicon codicon-chevron-down"></span>
</div>

<!-- Dropdown (appended to document.body with position: fixed) -->
<div class="lg-autosuggest__dropdown">
  <div class="lg-autosuggest__option" data-value="item1">
    Item 1
    <span class="lg-autosuggest__badge">✓</span>
  </div>
  <div class="lg-autosuggest__option lg-autosuggest__option--selected" data-value="item2">
    Item 2
  </div>
</div>
```

**Note:** Dropdown is rendered outside the container (in `document.body`) to avoid overflow clipping and parent scrollbar issues.

## Keyboard Navigation

- `Arrow Down` — next item
- `Arrow Up` — previous item
- `Enter` — select current item
- `Escape` — close dropdown
