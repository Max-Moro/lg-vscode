# Код-ревью после рефакторингов State Management и Bootstrap Layer

Дата: 2026-02-01

---

## 1. Критические проблемы

### ~~1.1. Providers не сохраняются в состоянии~~ ✅ ИСПРАВЛЕНО

Добавлена поддержка `envMutations` в `RuleResult` и обработка в `StateCoordinator`.
Правило `providersSelectInitial` теперь сохраняет providers в `EnvironmentState`.

---

## 2. Мертвый код

### 2.1. Метод `detectBestProvider()` не используется

**Файл:** `src/services/ai/AiIntegrationService.ts:38-62`

Метод `detectBestProvider()` реализован, но нигде не вызывается. В lifecycle rules используется `detectAvailableProviders()`.

**Решение:** Удалить `detectBestProvider()`.

---

### 2.2. Экспорт `getStore()` из store.ts

**Файл:** `src/state/store.ts`

Функция `getStore()` дублирует аналогичную из `src/bootstrap/index.ts`. Импорты в проекте идут из bootstrap.

**Решение:** Удалить экспорт из `store.ts`.

---

## 3. Архитектурные несоответствия

### 3.1. Дублирование в BootstrapResult

**Файл:** `src/bootstrap/index.ts`

Функция `bootstrap()` возвращает `{ vdocs, includedTree }`, но эти же объекты доступны через `getVdocs()` и `getIncludedTree()`.

**Рекомендация:** Убрать return и использовать только getters, либо убрать getters для этих компонентов.

---

## 4. Мелкие недочеты

### 4.1. Потенциальное дублирование в stats.js

**Файл:** `media/stats.js`

Установка значения textarea происходит дважды. Можно оставить только в `setupTaskTextField()`.

---

### 4.2. Динамические импорты в providers

**Файлы:** `src/services/ai/providers/*/`

Динамические импорты увеличивают latency при первом вызове. Рассмотреть статические импорты.

---

## Заключение

Критическая проблема с providers исправлена. Остальные найденные проблемы — технический долг, не блокирующий функционал.
