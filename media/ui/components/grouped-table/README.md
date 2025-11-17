# Grouped Table Component

Table component with advanced features: filtering, sorting, and hierarchical grouping.

## Features

- **Filtering**: Fast filtering by column content
- **Sorting**: Sort by any column with direction support (asc/desc)
- **Hierarchical Grouping**: Group rows by directory nesting levels
- **Path Normalization**: Automatic path normalization (files alongside directories are placed in virtual `self` directory)
- **Aggregation**: Automatic summation of numeric values when grouping

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

To calculate aggregated values based on other columns, use `aggregateFormula`:

```javascript
{
  key: 'savedPct',
  label: 'Saved%',
  align: 'right',
  format: (v) => v.toFixed(1) + '%',
  aggregateFormula: (aggregated) => {
    // Calculate savings percentage based on aggregated savedTokens and tokensRaw
    const saved = aggregated.savedTokens;
    const raw = aggregated.tokensRaw;

    if (saved != null && raw != null && raw > 0) {
      return (saved / raw) * 100.0;
    }
    return 0.0;
  }
}
```

**Important**: The formula is executed after aggregation of all other columns, so it has access to sums/averages of other columns in the group.

## Column Options

- `key` (string, required): Data key in the row object
- `label` (string, required): Column header
- `align` (string): Alignment ('left' | 'right')
- `sortable` (boolean): Whether this column is sortable
- `sortDirDefault` (string): Default sort direction ('asc' | 'desc')
- `format` (function): Value formatting function `(value, row) => string`
- `aggregate` (string): Aggregation method when grouping ('sum' | 'avg')
- `aggregateFormula` (function): Function to calculate aggregated value based on other columns `(aggregated) => value`. Takes priority over `aggregate`. Formula receives an object with already aggregated values of other columns.
- `warnIf` (function): Condition for warning highlight `(value, row) => boolean`
- `title` (string): Tooltip for column header

## Grouping Control

Grouping control allows changing the nesting level:

- **← / →**: Decrease/increase grouping level
- **∞**: Disable grouping (show all files)
- **1-N**: Group up to Nth nesting level

Maximum level is determined automatically based on path structure in data.

## Path Normalization

When grouping, the component automatically normalizes paths so files don't mix with directories at the same level:

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

- `setData(data)`: Update table data
- `destroy()`: Clear table and remove event handlers

### State

Component internal state:

- `sortKey`: Current column for sorting
- `sortDir`: Sort direction ('asc' | 'desc')
- `filterQuery`: Current filter
- `groupLevel`: Current grouping level (null = no grouping)
- `maxDepth`: Maximum depth of paths in data

