# Autosuggest Component

Комбобокс с автодополнением и поддержкой произвольного пользовательского ввода.

## Features

- ✅ Автофильтрация списка при вводе
- ✅ Клавиатурная навигация (Arrow Up/Down, Enter, Escape)
- ✅ Поддержка произвольного ввода (не только из списка)
- ✅ Индикация закэшированных элементов
- ✅ Lazy loading (асинхронная загрузка items)
- ✅ Кастомная функция фильтрации
- ✅ VS Code темизация
- ✅ Dropdown позиционируется через `position: fixed` и не влияет на layout родителей
- ✅ Dropdown автоматически перепозиционируется при скролле/resize

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
| `items` | `Array<string \| object>` | `[]` | Список элементов для автодополнения |
| `placeholder` | `string` | `''` | Placeholder для input |
| `getValue` | `function` | `item => item` | Функция извлечения значения из элемента |
| `isItemCached` | `function` | `item => item.cached` | Проверка, закэширован ли элемент |
| `onSelect` | `function` | `null` | Callback при выборе элемента из списка |
| `onChange` | `function` | `null` | Callback при изменении значения input |
| `filterFn` | `function` | `null` | Кастомная функция фильтрации |
| `minChars` | `number` | `0` | Минимальное количество символов для показа dropdown |

## Methods

- `setItems(items)` — обновить список элементов
- `setLoading(loading)` — показать/скрыть индикатор загрузки
- `open()` — открыть dropdown
- `close()` — закрыть dropdown
- `destroy()` — удалить компонент

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

- `Arrow Down` — следующий элемент
- `Arrow Up` — предыдущий элемент
- `Enter` — выбрать текущий элемент
- `Escape` — закрыть dropdown
