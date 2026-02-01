# Код-ревью после рефакторингов State Management и Bootstrap Layer

Дата: 2026-02-01

---

## 1. Критические проблемы

### 1.1. Providers не сохраняются в состоянии

**Файлы:** `src/state/rules/provider.rules.ts`, `src/state/types.ts`, `src/viewmodel/builder.ts`

**Проблема:** В архитектуре предусмотрен `EnvironmentState` с полем `providers`, который используется в `buildViewModel()`:

```typescript
// src/viewmodel/builder.ts:27
const providers: SelectOption[] = e.providers.map(p => ({
  value: p.id,
  label: p.name
}));
```

Однако ни одно бизнес-правило не обновляет `EnvironmentState`! В `RuleResult` есть только:
- `mutations` → `PersistentState`
- `configMutations` → `ConfigurationState`

Нет `envMutations` для обновления `EnvironmentState`.

В правиле `providersSelectInitial` есть комментарий:
```typescript
configMutations: {
  // Note: providers are stored in environment, handled by lifecycle rules
},
```

Но lifecycle rules этого не делают. Метод `store.updateEnvironment()` существует, но нигде не вызывается.

**Следствие:** Выпадающий список провайдеров в UI всегда пустой, так как `e.providers` никогда не заполняется.

**Решение:** Два варианта:
1. Перенести `providers` из `EnvironmentState` в `ConfigurationState` и обновлять через `configMutations`
2. Добавить `envMutations` в `RuleResult` и обработку в Coordinator

Рекомендуется вариант 1 — проще и соответствует семантике (providers загружаются динамически, как и остальные каталоги).

---

### 1.2. Отсутствует сохранение detected providers в правилах

**Файл:** `src/state/rules/provider.rules.ts`

**Проблема:** Правило `providersSelectInitial` получает `cmd.providers`, но не сохраняет их никуда:

```typescript
export const providersSelectInitial: TypedRule<"PROVIDERS_DETECTED"> = {
  // ...
  apply: (state, cmd) => {
    const providers = cmd.providers;
    // ... используются для выбора, но не сохраняются!
    return {
      configMutations: {}, // пустой объект
      followUp: [{ type: "SELECT_PROVIDER", providerId: effectiveProvider }]
    };
  }
};
```

**Решение:** Добавить сохранение провайдеров:
```typescript
configMutations: { providers: cmd.providers }
```

При условии переноса `providers` в `ConfigurationState`.

---

## 2. Мертвый код

### 2.1. Метод `detectBestProvider()` не используется

**Файл:** `src/services/ai/AiIntegrationService.ts:38-62`

**Проблема:** Метод `detectBestProvider()` реализован, но нигде не вызывается. В lifecycle rules используется `detectAvailableProviders()`.

**Решение:** Удалить `detectBestProvider()` или пометить как deprecated, если планируется использовать в будущем.

---

### 2.2. Экспорт `getStore()` из store.ts

**Файл:** `src/state/store.ts:175-177`

```typescript
export function getStore(): PCEStateStore {
  return PCEStateStore.getInstance();
}
```

**Проблема:** Эта функция дублирует `getStore()` из `src/bootstrap/index.ts`. Импорты в проекте идут из bootstrap, эта функция не используется.

**Решение:** Удалить экспорт из `store.ts`, оставить только в `bootstrap/index.ts`.

---

## 3. Архитектурные несоответствия

### 3.1. Дублирование в BootstrapResult

**Файл:** `src/bootstrap/index.ts`

**Проблема:** Функция `bootstrap()` возвращает `{ vdocs, includedTree }`, но эти же объекты доступны через `getVdocs()` и `getIncludedTree()`. Дублирование способа доступа.

**Текущее использование в extension.ts:**
```typescript
const { vdocs, includedTree } = bootstrap(context);
// Далее используются напрямую
```

**Рекомендация:** Это не критично, но можно упростить. Либо убрать return и использовать только getters, либо оставить return и убрать getters для этих двух компонентов.

---

### 3.2. EnvironmentState без механизма обновления

**Файлы:** `src/state/types.ts`, `src/state/coordinator.ts`

**Проблема:** `EnvironmentState` объявлен в типах, метод `updateEnvironment()` существует в Store, но:
1. Нет `envMutations` в `RuleResult`
2. Coordinator не обрабатывает обновления environment
3. Единственное поле `providers` фактически должно быть в Configuration

**Решение:** Переосмыслить назначение EnvironmentState. Если он нужен только для providers — перенести в Configuration. Если планируются другие environment-данные (платформа, версии) — добавить поддержку в правила.

---

## 4. Мелкие недочеты

### 4.1. Потенциальное дублирование в stats.js

**Файл:** `media/stats.js`

Установка значения textarea происходит дважды:
1. В блоке обработки `runResult` (строка ~25)
2. В функции `setupTaskTextField()` (строка ~47)

Это не баг, но избыточность. Можно оставить только в `setupTaskTextField()`.

---

### 4.2. Пустой catch в extension.ts

**Файл:** `src/extension.ts:61-63`

```typescript
locateCliOrOfferInstall().catch(() => {
  // Silently ignore — installer will appear on first real run.
});
```

Это намеренное поведение с комментарием, но лучше использовать `.catch(() => void 0)` для явности или добавить `logDebug`.

---

### 4.3. Динамические импорты в providers

**Файлы:** Все файлы в `src/services/ai/providers/*/`

Используются динамические импорты вида:
```typescript
const { getStore } = await import("../../../../bootstrap");
```

Это работает, но увеличивает latency при первом вызове. Рассмотреть статические импорты, если lazy loading не критичен.

---

## 5. Рекомендации по приоритетам

### Немедленно исправить (блокирует функционал):
1. **Критично:** Исправить сохранение providers — UI сейчас показывает пустой список

### В ближайшем рефакторинге:
2. Удалить мертвый код (`detectBestProvider()`, дублирующий `getStore()`)
3. Унифицировать подход к EnvironmentState

### При возможности:
4. Убрать дублирование в stats.js
5. Заменить динамические импорты на статические где возможно

---

## 6. Детальный план исправления критической проблемы

### Шаг 1: Перенести providers в ConfigurationState

**Файл:** `src/state/types.ts`

```typescript
export interface ConfigurationState {
  // ... existing fields
  providers: ProviderInfo[];  // ADD THIS
}

export interface EnvironmentState {
  // providers: ProviderInfo[];  // REMOVE THIS or keep empty for future
}

export function createDefaultConfigurationState(): ConfigurationState {
  return {
    // ... existing
    providers: []  // ADD THIS
  };
}
```

### Шаг 2: Обновить правило providersSelectInitial

**Файл:** `src/state/rules/provider.rules.ts`

```typescript
export const providersSelectInitial: TypedRule<"PROVIDERS_DETECTED"> = {
  // ...
  apply: (state, cmd) => {
    const savedProvider = state.persistent.providerId;
    const providers = cmd.providers;

    const savedExists = providers.some((p: ProviderInfo) => p.id === savedProvider);
    const effectiveProvider = savedExists
      ? savedProvider
      : (providers[0]?.id || "clipboard");

    return {
      configMutations: { providers },  // NOW SAVES PROVIDERS
      followUp: [{ type: "SELECT_PROVIDER", providerId: effectiveProvider }]
    };
  }
};
```

### Шаг 3: Обновить buildViewModel

**Файл:** `src/viewmodel/builder.ts`

```typescript
// Change from:
const providers: SelectOption[] = e.providers.map(...)
// To:
const providers: SelectOption[] = c.providers.map(...)
```

### Шаг 4: Удалить или оставить пустым EnvironmentState

Если никаких других environment-данных не планируется, можно упростить:
```typescript
export interface EnvironmentState {
  // Reserved for future platform/environment detection
}
```

---

## Заключение

После двух крупных рефакторингов кодовая база в целом хорошо структурирована. Основная проблема — незавершенная миграция `providers` в новую архитектуру состояния. Это критический баг, блокирующий работу UI выбора провайдера.

Остальные найденные проблемы носят характер технического долга и не блокируют функционал.
