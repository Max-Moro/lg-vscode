# Toolbar Component

**Horizontal action bar for buttons and controls**

---

## 📋 Overview

The Toolbar component provides a flexible horizontal container for buttons and other action elements. It's designed for use in webview headers and action bars where horizontal layout is needed (unlike the adaptive Control Panel which uses vertical layout for narrow panels).

**Key Features:**
- ✅ Horizontal flex layout with configurable gaps
- ✅ Fixed-width buttons (overrides default adaptive behavior)
- ✅ Optional separators and spacers
- ✅ Responsive wrapping for narrow viewports
- ✅ Multiple density variants (default, compact, dense)

---

## 🎯 When to Use

**Use Toolbar when:**
- Building horizontal action bars (Stats, Doctor, etc.)
- Need fixed-width buttons side-by-side
- Want consistent spacing between actions
- Building toolbar-like interfaces

**Don't use Toolbar for:**
- Vertical panels (use default `.lg-btn` adaptive behavior)
- Single buttons (just use `.lg-btn` directly)
- Form layouts (use grid/flex utilities)

---

## 🚀 Usage

### Basic Toolbar (Declarative)

```html
<div class="lg-toolbar">
  <button class="lg-btn lg-btn--primary" id="btn-send-ai">
    <span class="codicon codicon-send"></span>
    <span class="btn-text">Send to AI</span>
  </button>
  <button class="lg-btn" id="btn-generate">
    <span class="codicon codicon-file-code"></span>
    <span class="btn-text">Generate</span>
  </button>
  <button class="lg-btn" id="btn-refresh">
    <span class="codicon codicon-refresh"></span>
    <span class="btn-text">Refresh</span>
  </button>
</div>
```

### Toolbar with Separator

```html
<div class="lg-toolbar">
  <button class="lg-btn lg-btn--primary">Action 1</button>
  <button class="lg-btn">Action 2</button>
  
  <div class="lg-toolbar__separator"></div>
  
  <button class="lg-btn">Action 3</button>
  <button class="lg-btn">Action 4</button>
</div>
```

### Toolbar with Spacer (Push items to right)

```html
<div class="lg-toolbar">
  <button class="lg-btn">Left Action</button>
  
  <div class="lg-toolbar__spacer"></div>
  
  <button class="lg-btn">Right Action</button>
</div>
```

### Programmatic Usage

```javascript
/* global LGUI */
const { DOM } = LGUI;

// Create toolbar
const toolbar = LGUI.enhanceToolbar('#my-toolbar', {
  variant: 'compact' // 'default' | 'compact' | 'dense'
});

// Add items dynamically
const btn = DOM.create('button', { class: 'lg-btn' }, ['Click Me']);
toolbar.addItem(btn);
toolbar.addItem('separator');
toolbar.addItem('spacer');

// Get all buttons
const buttons = toolbar.getButtons();

// Clear toolbar
toolbar.clear();

// Destroy
toolbar.destroy();
```

---

## 🎨 Variants

### Default
```html
<div class="lg-toolbar">
  <!-- gap: 8px, margin-bottom: 12px -->
</div>
```

### Compact
```html
<div class="lg-toolbar lg-toolbar--compact">
  <!-- gap: 4px, margin-bottom: 6px -->
</div>
```

### Dense
```html
<div class="lg-toolbar lg-toolbar--dense">
  <!-- gap: 2px, margin-bottom: 4px -->
</div>
```

---

## 🔧 CSS Classes

| Class | Description |
|-------|-------------|
| `.lg-toolbar` | Base toolbar container |
| `.lg-toolbar--compact` | Reduced spacing variant |
| `.lg-toolbar--dense` | Minimal spacing variant |
| `.lg-toolbar__separator` | Vertical divider line |
| `.lg-toolbar__spacer` | Flexible spacer (pushes items) |

---

## 🎯 Design Decisions

### Why Toolbar overrides button flex behavior?

Buttons (`.lg-btn`) have `flex: 1 1 auto` by default for adaptive behavior in narrow Control Panel. Toolbar explicitly sets `flex: 0 0 auto` on child buttons to prevent them from expanding and maintain fixed width.

### Responsive Behavior

Toolbar uses `flex-wrap: wrap`, so buttons will naturally wrap to next line on narrow viewports instead of overflowing.

---

## 📚 Examples

### Stats Actions Bar

```html
<div class="lg-toolbar">
  <button class="lg-btn lg-btn--primary" id="btn-send-ai">
    <span class="codicon codicon-send"></span>
    <span class="btn-text">Send to AI</span>
  </button>
  <button id="btn-generate" class="lg-btn">
    <span class="codicon codicon-file-code"></span>
    <span class="btn-text">Generate Context</span>
  </button>
  <button id="btn-refresh" class="lg-btn">
    <span class="codicon codicon-refresh"></span>
    <span class="btn-text">Refresh</span>
  </button>
</div>
```

### Doctor Actions Bar

```html
<div class="lg-toolbar">
  <button class="lg-btn" id="btn-refresh">
    <span class="codicon codicon-refresh"></span>
    <span class="btn-text">Refresh</span>
  </button>
  <button class="lg-btn" id="btn-copy">
    <span class="codicon codicon-copy"></span>
    <span class="btn-text">Copy Report</span>
  </button>
</div>
```

---

## ⚙️ Future Enhancements

Possible extensions (not implemented yet):
- Auto-collapse overflow items into "More" menu
- Keyboard navigation between toolbar items
- ARIA roles and accessibility attributes
- Toolbar groups with labels
- Overflow indicators

---

## 📖 Related Components

- **Button** (`button/`) — Individual action buttons
- **Control Panel** (`control.css`) — Vertical adaptive layout
