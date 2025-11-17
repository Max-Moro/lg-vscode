/**
 * Grouped Table Component
 * Table with filtering, sorting, and hierarchical grouping
 */

import {DOM} from '../../utils/dom.js';
import {Events} from '../../utils/events.js';

export class GroupedTable {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? DOM.qs(container) : container;
    
    if (!this.container) {
      throw new Error('GroupedTable: container element not found');
    }

    this.options = {
      columns: [], // Array of {key, label, align, sortable, format}
      data: [],    // Array of row objects
      onRowClick: null,
      ...options
    };

    this.state = {
      sortKey: null,
      sortDir: 'asc',
      filterQuery: '',
      groupLevel: null, // null = no grouping (individual files)
      maxDepth: 0
    };

    this.cleanups = [];
    this.init();
  }

  init() {
    this.container.classList.add('lg-grouped-table');

    // Calculate max depth from data
    this.state.maxDepth = this.calculateMaxDepth();
    this.state.groupLevel = this.state.maxDepth + 1; // Start with no grouping

    this.render();
    this.bindEvents();
  }

  /**
   * Calculate maximum directory depth from file paths
   */
  calculateMaxDepth() {
    let max = 0;
    for (const row of this.options.data) {
      const pathCol = this.options.columns.find(c => c.key === 'path');
      if (!pathCol) continue;

      const path = row[pathCol.key] || '';
      const depth = path.split('/').filter(Boolean).length - 1; // -1 because filename doesn't count
      max = Math.max(max, depth);
    }
    return Math.max(1, max); // At least depth 1
  }

  render() {
    this.container.innerHTML = '';

    // Toolbar
    const toolbar = this.renderToolbar();
    this.container.appendChild(toolbar);

    // Table
    const table = this.renderTable();
    this.container.appendChild(table);
  }

  renderToolbar() {
    const toolbar = DOM.create('div', { class: 'lg-grouped-table__toolbar' });

    // Grouping control
    const grouping = DOM.create('div', { class: 'lg-grouped-table__grouping' }, [
      DOM.create('button', {
        class: 'lg-grouped-table__grouping-btn',
        'data-action': 'group-prev',
        title: 'Decrease grouping level'
      }, ['←']),
      
      DOM.create('span', { class: 'lg-grouped-table__grouping-value' }, [
        this.state.groupLevel > this.state.maxDepth ? '∞' : String(this.state.groupLevel)
      ]),
      
      DOM.create('button', {
        class: 'lg-grouped-table__grouping-btn',
        'data-action': 'group-next',
        title: 'Increase grouping level'
      }, ['→'])
    ]);

    // Filter
    const filter = DOM.create('div', { class: 'lg-grouped-table__filter' }, [
      DOM.create('label', { class: 'lg-grouped-table__filter-label' }, ['Filter:']),
      DOM.create('input', {
        type: 'search',
        class: 'lg-input lg-grouped-table__filter-input',
        placeholder: 'path or ext',
        'data-filter': 'true'
      })
    ]);

    toolbar.appendChild(grouping);
    toolbar.appendChild(filter);

    return toolbar;
  }

  renderTable() {
    const wrapper = DOM.create('div');

    const table = DOM.create('table', { class: 'lg-grouped-table__table' });
    
    // Header
    const thead = this.renderTableHead();
    table.appendChild(thead);

    // Body
    const tbody = this.renderTableBody();
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
  }

  renderTableHead() {
    const thead = DOM.create('thead');
    const tr = DOM.create('tr');

    for (const col of this.options.columns) {
      const classes = ['lg-grouped-table__th'];
      if (col.sortable) classes.push('sortable');
      if (col.align === 'right') classes.push('right');
      if (this.state.sortKey === col.key) classes.push('active');

      const th = DOM.create('th', {
        class: classes.join(' '),
        'data-key': col.key,
        'data-dir-default': col.sortDirDefault || 'asc',
        title: col.title || ''
      });

      th.textContent = col.label;

      if (col.sortable) {
        const arrow = DOM.create('span', { class: 'arrow' });
        arrow.textContent = this.state.sortDir === 'asc' ? '▲' : '▼';
        th.appendChild(arrow);
      }

      tr.appendChild(th);
    }

    thead.appendChild(tr);
    return thead;
  }

  renderTableBody() {
    const tbody = DOM.create('tbody', { class: 'lg-grouped-table__tbody' });

    // Get filtered and sorted data
    const filtered = this.filterData();
    const sorted = this.sortData(filtered);

    // Group or flatten
    const rows = this.state.groupLevel > this.state.maxDepth
      ? this.renderFlatRows(sorted)
      : this.renderGroupedRows(sorted);

    if (rows.length === 0) {
      const emptyRow = DOM.create('tr');
      const emptyCell = DOM.create('td', {
        colspan: String(this.options.columns.length),
        class: 'lg-grouped-table__empty'
      }, ['No files match the filter.']);
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      rows.forEach(row => tbody.appendChild(row));
    }

    return tbody;
  }

  filterData() {
    const query = this.state.filterQuery.toLowerCase();
    if (!query) return this.options.data.slice();

    return this.options.data.filter(row => {
      const pathCol = this.options.columns.find(c => c.key === 'path');
      if (!pathCol) return true;

      const path = String(row[pathCol.key] || '').toLowerCase();
      return path.includes(query) || (query.startsWith('.') && path.endsWith(query));
    });
  }

  sortData(data) {
    if (!this.state.sortKey) return data;

    const sorted = data.slice();
    const col = this.options.columns.find(c => c.key === this.state.sortKey);
    if (!col) return sorted;

    const dir = this.state.sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      const valA = a[this.state.sortKey];
      const valB = b[this.state.sortKey];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return dir * (valA - valB);
      }

      return dir * String(valA).localeCompare(String(valB));
    });

    return sorted;
  }

  renderFlatRows(data) {
    return data.map(row => {
      const tr = DOM.create('tr', {
        class: 'lg-grouped-table__file-row',
        'data-path': row.path || ''
      });

      for (const col of this.options.columns) {
        const td = DOM.create('td', {
          class: col.align === 'right' ? 'right' : ''
        });

        if (col.key === 'path') {
          td.classList.add('monosmall');
        }

        const value = row[col.key];
        const formatted = col.format ? col.format(value, row) : String(value ?? '');

        if (col.warnIf && col.warnIf(value, row)) {
          td.classList.add('warn');
        }

        td.innerHTML = formatted;
        tr.appendChild(td);
      }

      return tr;
    });
  }

  renderGroupedRows(data) {
    // Normalize paths: files alongside dirs go into 'self'
    const normalized = this.normalizePathsForGrouping(data, this.state.groupLevel);

    // Build tree structure
    const tree = this.buildGroupTree(normalized, this.state.groupLevel);

    // Render tree as rows
    return this.renderTree(tree);
  }

  /**
   * Normalize paths: ensure all paths have at least 'depth' segments
   * by inserting 'self' before the filename as needed
   */
  normalizePathsForGrouping(data, depth) {
    const pathCol = this.options.columns.find(c => c.key === 'path');
    if (!pathCol) return data;

    return data.map(row => {
      const path = row[pathCol.key] || '';
      const parts = path.split('/').filter(Boolean);

      // If path has <= depth segments, insert 'self' before filename
      // until we have exactly 'depth + 1' segments (depth dirs + 1 file)
      if (parts.length <= depth) {
        // Insert 'self' at position (length - 1) repeatedly
        while (parts.length <= depth) {
          parts.splice(parts.length - 1, 0, 'self');
        }
        return { ...row, _normalizedPath: parts.join('/') };
      }

      // Path is already >= depth, no normalization needed
      return { ...row, _normalizedPath: path };
    });
  }

  /**
   * Build tree structure for grouping
   */
  buildGroupTree(data, depth) {
    const pathCol = this.options.columns.find(c => c.key === 'path');
    if (!pathCol) return [];

    const tree = new Map();

    for (const row of data) {
      const path = row._normalizedPath || row[pathCol.key] || '';
      const parts = path.split('/').filter(Boolean);

      // Group by prefix of length depth
      const prefix = parts.slice(0, depth).join('/');

      if (!prefix) {
        // Files in root (shouldn't happen with proper normalization)
        continue;
      }

      if (!tree.has(prefix)) {
        tree.set(prefix, { files: [], children: new Map() });
      }
      tree.get(prefix).files.push(row);
    }

    return tree;
  }

  /**
   * Render tree structure as table rows
   */
  renderTree(tree) {
    const rows = [];

    // Build array of groups with aggregated values
    const groups = Array.from(tree.entries()).map(([prefix, group]) => ({
      prefix,
      aggregated: this.aggregateGroup(group.files)
    }));

    // Sort groups by current sort key and direction
    this.sortGroups(groups);

    for (const {prefix, aggregated} of groups) {
      // Clean up display path: remove trailing 'self' segments
      const displayPath = this.getDisplayPath(prefix);

      // Group header row
      const groupRow = DOM.create('tr', { class: 'lg-grouped-table__group-row' });

      for (const col of this.options.columns) {
        const td = DOM.create('td', {
          class: col.align === 'right' ? 'right' : ''
        });

        if (col.key === 'path') {
          const label = DOM.create('div', { class: 'lg-grouped-table__group-label' }, [
            DOM.create('span', { class: 'lg-grouped-table__group-icon codicon codicon-folder' }),
            DOM.create('span', {}, [displayPath])
          ]);
          td.appendChild(label);
        } else {
          const value = aggregated[col.key];
          td.innerHTML = col.format ? col.format(value, aggregated) : String(value ?? '');
        }

        groupRow.appendChild(td);
      }

      rows.push(groupRow);
    }

    return rows;
  }

  /**
   * Sort groups by current sort key and direction
   */
  sortGroups(groups) {
    if (!this.state.sortKey) {
      // Default: sort by path alphabetically
      groups.sort((a, b) => a.prefix.localeCompare(b.prefix));
      return;
    }
    
    const col = this.options.columns.find(c => c.key === this.state.sortKey);
    if (!col) return;

    const dir = this.state.sortDir === 'asc' ? 1 : -1;

    groups.sort((a, b) => {
      // Special handling for path column
      if (this.state.sortKey === 'path') {
        return dir * a.prefix.localeCompare(b.prefix);
      }

      // Sort by aggregated values
      const valA = a.aggregated[this.state.sortKey];
      const valB = b.aggregated[this.state.sortKey];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return dir * (valA - valB);
      }

      return dir * String(valA || '').localeCompare(String(valB || ''));
    });
  }

  /**
   * Get display path: remove 'self' segments and add trailing slash
   */
  getDisplayPath(prefix) {
    const parts = prefix.split('/').filter(Boolean);

    // Remove trailing 'self' segments
    while (parts.length > 0 && parts[parts.length - 1] === 'self') {
      parts.pop();
    }

    // If nothing left (was all 'self'), show root
    if (parts.length === 0) {
      return '/';
    }

    // Add trailing slash to indicate it's a group
    return parts.join('/') + '/';
  }

  /**
   * Aggregate numeric columns for a group
   *
   * Two-pass aggregation:
   * 1. First pass: aggregate all non-formula columns (SUM/AVG)
   * 2. Second pass: calculate formula columns using aggregated values
   */
  aggregateGroup(files) {
    const result = { path: '' };

    // First pass: aggregate all non-formula columns
    for (const col of this.options.columns) {
      if (col.key === 'path') continue;

      // Skip formula columns in first pass
      if (col.aggregateFormula) continue;

      const values = files.map(f => f[col.key]).filter(v => typeof v === 'number');

      if (values.length > 0) {
        if (col.aggregate === 'avg') {
          result[col.key] = values.reduce((sum, v) => sum + v, 0) / values.length;
        } else {
          // Default: sum
          result[col.key] = values.reduce((sum, v) => sum + v, 0);
        }
      } else {
        result[col.key] = 0;
      }
    }

    // Second pass: calculate formula columns
    for (const col of this.options.columns) {
      if (col.key === 'path') continue;

      if (col.aggregateFormula) {
        // Formula receives aggregated values from first pass
        result[col.key] = col.aggregateFormula(result);
      }
    }

    return result;
  }

  bindEvents() {
    // Grouping controls
    this.cleanups.push(
      Events.delegate(this.container, '[data-action="group-prev"]', 'click', () => {
        if (this.state.groupLevel > 1) {
          this.state.groupLevel--;
          this.updateView();
        }
      })
    );

    this.cleanups.push(
      Events.delegate(this.container, '[data-action="group-next"]', 'click', () => {
        if (this.state.groupLevel <= this.state.maxDepth) {
          this.state.groupLevel++;
          this.updateView();
        }
      })
    );

    // Filter input
    this.cleanups.push(
      Events.delegate(this.container, '[data-filter="true"]', 'input', 
        Events.debounce((input) => {
          this.state.filterQuery = input.value.trim();
          this.updateView();
        }, 120)
      )
    );

    // Sortable columns
    this.cleanups.push(
      Events.delegate(this.container, 'th.sortable', 'click', (th) => {
        const key = th.getAttribute('data-key');
        if (!key) return;

        if (key === this.state.sortKey) {
          this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.sortKey = key;
          this.state.sortDir = th.getAttribute('data-dir-default') || 'asc';
        }

        this.updateView();
      })
    );

    // Row click
    if (this.options.onRowClick) {
      this.cleanups.push(
        Events.delegate(this.container, 'tr[data-path]', 'click', (tr) => {
          const path = tr.getAttribute('data-path');
          if (path && this.options.onRowClick) {
            this.options.onRowClick(path, tr);
          }
        })
      );
    }
  }

  updateView() {
    // Re-render table
    const oldTable = this.container.querySelector('.lg-grouped-table__table')?.parentElement;
    if (oldTable) {
      const newTable = this.renderTable();
      oldTable.replaceWith(newTable);
    }

    // Update grouping display
    const valueDisplay = this.container.querySelector('.lg-grouped-table__grouping-value');
    if (valueDisplay) {
      valueDisplay.textContent = this.state.groupLevel > this.state.maxDepth 
        ? '∞' 
        : String(this.state.groupLevel);
    }

    // Update button states
    const prevBtn = this.container.querySelector('[data-action="group-prev"]');
    const nextBtn = this.container.querySelector('[data-action="group-next"]');
    
    if (prevBtn) {
      prevBtn.disabled = this.state.groupLevel <= 1;
    }
    
    if (nextBtn) {
      nextBtn.disabled = this.state.groupLevel > this.state.maxDepth;
    }
  }

  setData(data) {
    this.options.data = data;
    this.state.maxDepth = this.calculateMaxDepth();
    this.updateView();
  }

  destroy() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.container.innerHTML = '';
    this.container.classList.remove('lg-grouped-table');
  }
}

/**
 * Create grouped table
 */
export function createGroupedTable(container, options) {
  return new GroupedTable(container, options);
}

