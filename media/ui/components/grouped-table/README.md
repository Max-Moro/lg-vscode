# Grouped Table Component

Компонент таблицы с расширенными возможностями: фильтрация, сортировка и иерархическая группировка.

## Features

- **Filtering**: Быстрая фильтрация по содержимому колонок
- **Sorting**: Сортировка по любой колонке с поддержкой направления (asc/desc)
- **Hierarchical Grouping**: Группировка строк по уровням вложенности директорий
- **Path Normalization**: Автоматическая нормализация путей (файлы рядом с папками помещаются в виртуальную директорию `self`)
- **Aggregation**: Автоматическое суммирование числовых значений при группировке

## Usage

```javascript
import { createGroupedTable } from './components/grouped-table/grouped-table.js';

const table = createGroupedTable('#container', {
  columns: [
    {
      key: 'path',
      label: 'Path',
      align: 'left',
      sortable: true,
      sortDirDefault: 'asc'
    },
    {
      key: 'size',
      label: 'Size',
      align: 'right',
      sortable: true,
      sortDirDefault: 'desc',
      format: (value) => formatBytes(value)
    },
    {
      key: 'tokens',
      label: 'Tokens',
      align: 'right',
      sortable: true,
      format: (value) => value.toLocaleString(),
      aggregate: 'sum' // 'sum' or 'avg'
    }
  ],
  data: [
    { path: 'src/app/main.ts', size: 1024, tokens: 256 },
    { path: 'src/app/utils/helper.ts', size: 512, tokens: 128 },
    // ...
  ],
  onRowClick: (path, rowElement) => {
    console.log('Clicked:', path);
  }
});

// Update data
table.setData(newData);

// Cleanup
table.destroy();
```

### Formula-based Aggregation

Для вычисления агрегированных значений на основе других колонок используйте `aggregateFormula`:

```javascript
{
  key: 'savedPct',
  label: 'Saved%',
  align: 'right',
  format: (v) => v.toFixed(1) + '%',
  aggregateFormula: (aggregated) => {
    // Вычисляем процент экономии на основе агрегированных savedTokens и tokensRaw
    const saved = aggregated.savedTokens;
    const raw = aggregated.tokensRaw;

    if (saved != null && raw != null && raw > 0) {
      return (saved / raw) * 100.0;
    }
    return 0.0;
  }
}
```

**Важно**: Формула выполняется после агрегации всех остальных колонок, поэтому она имеет доступ к суммам/средним значениям других колонок в группе.

## Column Options

- `key` (string, required): Ключ данных в объекте строки
- `label` (string, required): Заголовок колонки
- `align` (string): Выравнивание ('left' | 'right')
- `sortable` (boolean): Можно ли сортировать по этой колонке
- `sortDirDefault` (string): Направление сортировки по умолчанию ('asc' | 'desc')
- `format` (function): Функция форматирования значения `(value, row) => string`
- `aggregate` (string): Метод агрегации при группировке ('sum' | 'avg')
- `aggregateFormula` (function): Функция для вычисления агрегированного значения на основе других колонок `(aggregated) => value`. Имеет приоритет над `aggregate`. Формула получает объект с уже агрегированными значениями других колонок.
- `warnIf` (function): Условие для подсветки предупреждением `(value, row) => boolean`
- `title` (string): Tooltip для заголовка колонки

## Grouping Control

Контрол группировки позволяет изменять уровень вложенности:

- **← / →**: Уменьшить/увеличить уровень группировки
- **∞**: Отключить группировку (показывать все файлы)
- **1-N**: Группировать до N-го уровня вложенности

Максимальный уровень определяется автоматически на основе структуры путей в данных.

## Path Normalization

При группировке компонент автоматически нормализует пути так, чтобы файлы не смешивались с директориями на одном уровне:

```
Before normalization:
  apps/
    web/
      page.tsx
    mobile.tsx  <- file alongside directory

After normalization:
  apps/
    web/
      page.tsx
    self/
      mobile.tsx  <- moved to virtual 'self' directory
```

## API

### Methods

- `setData(data)`: Обновить данные таблицы
- `destroy()`: Очистить таблицу и удалить обработчики событий

### State

Внутреннее состояние компонента:

- `sortKey`: Текущая колонка для сортировки
- `sortDir`: Направление сортировки ('asc' | 'desc')
- `filterQuery`: Текущий фильтр
- `groupLevel`: Текущий уровень группировки (null = без группировки)
- `maxDepth`: Максимальная глубина путей в данных

