# LG UI Components — Changelog

## ✅ Migration Status

### Control Panel — COMPLETED ✅

**Date**: 2025-10-09

#### Files Changed:
- ✅ `control.js` — Migrated to LGUI API
- ✅ `control.html` — Updated to use lg-ui bundles
- ✅ `control.css` — Removed duplicate component styles (564→380 lines, -32%)

#### Changes Made:

##### 1. JavaScript Migration (`control.js`)

**Global Namespace**
   - ❌ `/* global UI */` → ✅ `/* global LGUI */`
   - ❌ `const vscode = UI.acquire()` → ✅ `const vscode = State.getVSCode()`
   - ❌ `const store = UI.stateStore(vscode)` → ✅ Using `State.get()`, `State.set()`, `State.merge()`

2. **DOM Utilities**
   - ❌ `UI.qs()` → ✅ `DOM.qs()`
   - ❌ `UI.qsa()` → ✅ `DOM.qsa()`

3. **Event Handling**
   - ❌ `UI.delegate()` → ✅ `Events.delegate()`
   - ❌ `UI.debounce()` → ✅ `Events.debounce()`
   - ❌ `UI.post()` → ✅ `State.post()`

4. **State Management**
   - ❌ `store.get()` → ✅ `State.get()`
   - ❌ `store.merge()` → ✅ `State.merge()`
   - ❌ `UI.setState()` → ✅ `applyStateToDOM()` (custom helper)

5. **Components**
   - ❌ `UI.fillSelect()` → ✅ `LGUI.fillSelect()`
   - ❌ Custom autosuggest implementation (150+ lines) → ✅ `LGUI.createAutosuggest()` (10 lines)
   - ✅ Enhanced encoder input with proper autosuggest component

##### 2. CSS Cleanup (`control.css`)

**Removed Component Styles** (now in lg-ui.css):
   - ❌ Button styles (~50 lines)
   - ❌ Select styles (~25 lines)
   - ❌ Input styles (~80 lines)
   - ❌ Autosuggest dropdown styles (~45 lines)

**Kept Layout Styles**:
   - ✅ Container system (`.block`, `.row`, `.cluster`)
   - ✅ Container queries (`@container` breakpoints)
   - ✅ Adaptive settings (mode sets, tags panel)
   - ✅ Task context field layout

**Result**: 564 lines → 380 lines (~32% reduction)

#### Benefits:

✅ **Reduced JS code**: ~150 lines of custom autosuggest → 10 lines using component  
✅ **Reduced CSS code**: 564 lines → 380 lines (32% smaller)  
✅ **No duplication**: Component styles in one place only (lg-ui.css)  
✅ **Better UX**: Autosuggest now has keyboard navigation, badges for cached items  
✅ **Maintainability**: Using standard LGUI API instead of custom code  
✅ **Consistency**: Same component library across all views  
✅ **Type safety**: All LGUI components have proper JSDoc types  
✅ **Clear separation**: Layout (control.css) vs Components (lg-ui.css)  

---

## 🔄 Next Steps

### Stats View — COMPLETED ✅

**Date**: 2025-10-09

#### Files Changed:
- ✅ `stats.js` — Migrated to LGUI API
- ✅ `stats.html` — Updated to use lg-ui bundles
- ✅ `stats.css` — Added lg-input class to filter input
- ✅ `StatsWebview.ts` — Updated to pass lgUiCssUri/lgUiJsUri

#### Changes Made:

**JavaScript Migration (`stats.js`)**:
- `UI.acquire()` → `State.getVSCode()`
- `UI.post()` → `State.post()`
- `UI.on()` → `Events.on()`
- `UI.delegate()` → `Events.delegate()`
- `UI.debounce()` → `Events.debounce()`

**CSS Optimization (`stats.css`)**:
- Added `lg-input` class to filter input
- Removed duplicate input styling
- Stats.css already clean (47 lines, no component styles)

**HTML Updates (`stats.html`)**:
- Removed `{{baseCssUri}}` and `{{commonUiJsUri}}`
- Added `{{lgUiCssUri}}` and `{{lgUiJsUri}}`

#### Benefits:
✅ **Consistency**: Same LGUI API as Control Panel  
✅ **Clean code**: No legacy UI.* calls  
✅ **Smaller bundle**: Removed common-ui.js dependency  

---

### Doctor View — COMPLETED ✅

**Date**: 2025-10-09

#### Files Changed:
- ✅ `doctor.js` — Migrated to LGUI API
- ✅ `doctor.html` — Updated to use lg-ui bundles
- ✅ `doctor.css` — Already perfect (4 lines, layout only)
- ✅ `DoctorWebview.ts` — Updated to pass lgUiCssUri/lgUiJsUri

#### Changes Made:

**JavaScript Migration (`doctor.js`)**:
- `UI.acquire()` → `State.getVSCode()`
- `UI.post()` → `State.post()` (5 calls)

**CSS Status (`doctor.css`)**:
- Already perfect — only 4 lines of layout styles
- No component styles to remove
- Just updated comment

**HTML Updates (`doctor.html`)**:
- Removed `{{baseCssUri}}` and `{{commonUiJsUri}}`
- Added `{{lgUiCssUri}}` and `{{lgUiJsUri}}`

#### Benefits:
✅ **Fastest migration** — Doctor was already well-structured  
✅ **Clean code** — No legacy UI.* calls  
✅ **Minimal CSS** — Only 4 lines of layout styles  

---

### Legacy Cleanup — COMPLETED ✅

**Date**: 2025-10-09

#### Files Deleted:
- ✅ `common-ui.js` — Completely removed (170 lines)

#### Files Cleaned:
- ✅ `base.css` — Removed duplicate button styles, kept .btn-primary mapping for compatibility

#### Changes Made:

**Deleted Files**:
- `media/common-ui.js` — No longer needed after LGUI migration
  - Was 170 lines of legacy UI utilities
  - Replaced by lg-ui.js (22 KB, more features)

**base.css Cleanup**:
- Removed duplicate button styles (now in lg-ui.css)
- ~~Kept `.btn-primary` compatibility mapping~~ **REMOVED** — fully migrated to `.lg-btn--primary`
- File reduced from 113 → 101 → **91 lines** (-22 lines total)

#### Benefits:
✅ **Cleaner codebase** — Removed 170 lines of legacy code  
✅ **No duplication** — Button styles only in lg-ui.css  
✅ **Backward compatible** — .btn-primary still works  
✅ **Single source** — All component styles in one place  

---

## 📊 Migration Summary

### All Views Migrated! 🎉

| View | JavaScript | HTML | CSS | Status |
|------|-----------|------|-----|--------|
| **Control Panel** | ~17 API calls → LGUI | lg-ui bundles | 564→380 lines | ✅ |
| **Stats View** | ~17 API calls → LGUI | lg-ui bundles | 47 lines (clean) | ✅ |
| **Doctor View** | ~6 API calls → LGUI | lg-ui bundles | 4 lines (clean) | ✅ |

### Legacy Files Status

| File | Before | After | Status |
|------|--------|-------|--------|
| `common-ui.js` | 170 lines | **DELETED** | ✅ |
| `base.css` | 113 lines | 101 lines | ✅ |
| `control.css` | 564 lines | 380 lines | ✅ |
| `stats.css` | 47 lines | 47 lines | ✅ |
| `doctor.css` | 4 lines | 4 lines | ✅ |

### Total Impact

- **JavaScript**: ~40 UI.* calls → LGUI API
- **CSS Reduction**: -206 lines total (base.css: -22, control.css: -184)
- **Files Deleted**: 1 (common-ui.js, 170 lines)
- **Legacy Classes Removed**: .btn-primary → .lg-btn--primary (13 buttons + 3 generated)
- **Bundle Size**: All views now use lg-ui.css (12.7 KB) + lg-ui.js (22 KB)
- **Consistency**: 100% — all views use same component library, zero legacy classes

---

## 🔄 Next Steps (Remaining)

### Legacy Cleanup — PENDING ⏳
- [ ] Delete `media/common-ui.js` (no longer needed)
- [ ] Clean up `media/base.css` (remove redundant styles)
- ✅ Clean up `media/control.css` (remove component styles, keep only layout)

---

## 📚 API Migration Reference

### Quick Reference Table

| Old API (UI namespace) | New API (LGUI namespace) | Notes |
|------------------------|--------------------------|-------|
| `UI.acquire()` | `State.getVSCode()` | Cached, no need to store |
| `UI.post(vscode, type, data)` | `State.post(type, data)` | vscode param removed |
| `UI.stateStore(vscode)` | `State.*` methods | Use `State.get()`, `State.set()`, `State.merge()` |
| `UI.qs(selector)` | `DOM.qs(selector)` | Same API |
| `UI.qsa(selector)` | `DOM.qsa(selector)` | Returns array |
| `UI.delegate(root, sel, type, fn)` | `Events.delegate(root, sel, type, fn)` | Same API |
| `UI.debounce(fn, ms)` | `Events.debounce(fn, ms)` | Same API |
| `UI.throttle(fn, ms)` | `Events.throttle(fn, ms)` | Same API |
| `UI.fillSelect(sel, items, opts)` | `LGUI.fillSelect(sel, items, opts)` | Same API |
| `UI.setState(state)` | Custom `applyStateToDOM(state)` | Or use DOM directly |
| `UI.getState(keys)` | Not needed | Use `State.get()` + DOM queries |
| Custom autosuggest | `LGUI.createAutosuggest(input, opts)` | Cleaner API |

### Example Migration Pattern

**Before:**
```javascript
/* global UI */
const vscode = UI.acquire();
const store = UI.stateStore(vscode);

UI.delegate(document, "button", "click", (el) => {
  UI.post(vscode, "action", { data: "value" });
});

const input = UI.qs("#myInput");
store.merge({ value: input.value });
```

**After:**
```javascript
/* global LGUI */
const { DOM, Events, State } = LGUI;
const vscode = State.getVSCode();

Events.delegate(document, "button", "click", (el) => {
  State.post("action", { data: "value" });
});

const input = DOM.qs("#myInput");
State.merge({ value: input.value });
```

---

## 🧹 Base.css Cleanup — COMPLETED ✅

**Date**: 2025-10-09

### Problem

`media/base.css` contained **two UI components** that violated the new architecture principle:
> "All UI component styles must be in `media/ui/components/`, not scattered in `base.css`"

### Issues Found

1. **`textarea.rawjson`** (9 lines) — Debug component for displaying raw JSON
2. **`.task-context-field`** (55 lines) — Chat-like textarea, **duplicated** `.lg-chat-input`

### Solution

#### 1. Created `lg-code-viewer` Component

**Files Created:**
- `media/ui/components/code-viewer/code-viewer.css` — Monospace textarea styles
- `media/ui/components/code-viewer/README.md` — Component documentation
- Updated `src/build-ui.ts` — Added to COMPONENTS array

**Migration:**
- `doctor.js` line 120: `class="rawjson"` → `class="lg-code-viewer"`
- `stats.js` line 254: `class="rawjson"` → `class="lg-code-viewer"`
- Deleted `textarea.rawjson` from `base.css` (9 lines)

#### 2. Migrated to Existing `lg-chat-input` Component

**Migration:**
- `control.html` line 24: `class="task-context-field"` → `class="lg-chat-input"`
- `stats.js` line 81: `class="task-context-field"` → `class="lg-chat-input"`
- `control.css` line 371: `.task-context-field` → `.lg-chat-input` (layout reference)
- Deleted entire **TASK CONTEXT FIELD** section from `base.css` (55 lines)

### Results

**base.css Reduction:**
- **Before**: 95 lines (contained 2 UI components)
- **After**: 26 lines (only utilities: cards, pills, table)
- **Reduction**: -69 lines (-73%)

**Final base.css Content:**
- ✅ CSS variables (`:root`)
- ✅ Base typography (`body`, `h2`)
- ✅ Utility classes (`.card`, `.pill`, `.muted`, `.monosmall`, `.right`)
- ✅ Table styles (`table`, `th`, `td`)
- ❌ **Zero UI components** ✨

**Verification:**
```bash
# Legacy classes removed
grep -r "class=\"rawjson\"" media/ → 0 matches ✅
grep -r "task-context-field" media/ → 0 matches ✅

# New components in use
grep -r "lg-code-viewer" media/ → 2 files (doctor.js, stats.js) ✅
grep -r "lg-chat-input" media/ → 2 files (control.html, stats.js) ✅
```

**Bundle Update:**
- `lg-ui.css` grew from 12.7 KB → 13.6 KB (+900 bytes for code-viewer)
- `lg-ui.css` now contains **8 components** (added code-viewer)

### Benefits

✅ **100% Architecture Compliance** — No UI components outside `media/ui/components/`  
✅ **Eliminated Duplication** — `.task-context-field` was 99% duplicate of `.lg-chat-input`  
✅ **Single Source of Truth** — All textarea variants now in component library  
✅ **Cleaner base.css** — 73% smaller, only utilities remain  
✅ **Better Maintainability** — Component docs + proper structure  
✅ **Consistent Naming** — All components use `.lg-*` prefix  

---

## 🎓 Learning Resources

- **[README.md](./README.md)** — Overview & quick start
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System architecture
- **[MIGRATION.md](./MIGRATION.md)** — Full migration guide
- **[autosuggest/README.md](./components/autosuggest/README.md)** — Autosuggest API docs
- **[code-viewer/README.md](./components/code-viewer/README.md)** — Code Viewer API docs

---

Built with ❤️ for Listing Generator VS Code Extension
