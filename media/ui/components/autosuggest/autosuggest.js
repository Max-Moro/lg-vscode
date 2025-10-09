/**
 * Autosuggest Component
 * Комбобокс с автодополнением и поддержкой произвольного ввода
 */

import { DOM } from '../../utils/dom.js';
import { Events } from '../../utils/events.js';

export class Autosuggest {
  constructor(input, options = {}) {
    this.input = typeof input === 'string' ? DOM.qs(input) : input;
    
    if (!this.input) {
      throw new Error('Autosuggest: input element not found');
    }

    this.options = {
      items: [], // Array of strings or objects with {name, cached}
      placeholder: '',
      getValue: (item) => typeof item === 'string' ? item : item.name,
      isItemCached: (item) => typeof item === 'object' && item.cached,
      onSelect: null,
      onChange: null,
      filterFn: null, // Custom filter function
      minChars: 0,
      ...options
    };

    this.isOpen = false;
    this.selectedIndex = -1;
    this.filteredItems = [];
    this.cleanups = [];

    this.init();
  }

  init() {
    // Wrap input in container
    this.container = DOM.create('div', { class: 'lg-autosuggest' });
    this.input.parentNode.insertBefore(this.container, this.input);
    this.container.appendChild(this.input);

    // Add classes to input
    this.input.classList.add('lg-autosuggest__input');
    if (this.options.placeholder) {
      this.input.placeholder = this.options.placeholder;
    }

    // Create indicator
    this.indicator = DOM.create('span', {
      class: 'lg-autosuggest__indicator codicon codicon-chevron-down'
    });
    this.container.appendChild(this.indicator);

    // Create dropdown
    this.dropdown = DOM.create('div', { class: 'lg-autosuggest__dropdown' });
    this.container.appendChild(this.dropdown);

    this.bindEvents();
  }

  bindEvents() {
    // Input events
    this.cleanups.push(
      Events.on(this.input, 'input', () => {
        this.handleInput();
      })
    );

    this.cleanups.push(
      Events.on(this.input, 'focus', () => {
        // При фокусе не открываем автоматически - позволяем пользователю просто вводить текст
      })
    );

    // Click toggle - открываем/закрываем dropdown при клике на поле
    this.cleanups.push(
      Events.on(this.input, 'click', (e) => {
        // Останавливаем всплытие, чтобы не сработал document click
        e.stopPropagation();
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      })
    );

    this.cleanups.push(
      Events.on(this.input, 'blur', () => {
        // Delay to allow click on dropdown
        setTimeout(() => this.close(), 200);
      })
    );

    // Keyboard navigation
    this.cleanups.push(
      Events.on(this.input, 'keydown', (e) => {
        this.handleKeydown(e);
      })
    );

    // Dropdown clicks
    this.cleanups.push(
      Events.delegate(this.dropdown, '.lg-autosuggest__option:not(.lg-autosuggest__option--empty)', 'click', (el) => {
        const value = el.dataset.value;
        this.selectValue(value);
      })
    );

    // Click outside
    this.cleanups.push(
      Events.on(document, 'click', (e) => {
        if (!this.container.contains(e.target)) {
          this.close();
        }
      })
    );
  }

  handleInput() {
    const value = this.input.value;
    
    if (this.options.onChange) {
      this.options.onChange(value);
    }

    if (value.length >= this.options.minChars) {
      this.filter(value);
      this.open();
    } else {
      this.close();
    }
  }

  handleKeydown(e) {
    if (!this.isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.open();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
      case 'Enter':
        e.preventDefault();
        this.selectCurrent();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  filter(query) {
    const lowerQuery = query.toLowerCase();
    
    if (this.options.filterFn) {
      this.filteredItems = this.options.filterFn(this.options.items, query);
    } else {
      this.filteredItems = this.options.items.filter(item => {
        const value = this.options.getValue(item);
        return value.toLowerCase().includes(lowerQuery);
      });
    }

    this.selectedIndex = -1;
    this.renderDropdown();
  }

  renderDropdown() {
    this.dropdown.innerHTML = '';

    if (this.filteredItems.length === 0) {
      const empty = DOM.create('div', {
        class: 'lg-autosuggest__option lg-autosuggest__option--empty'
      }, [this.input.value ? 'No matches' : 'No items available']);
      this.dropdown.appendChild(empty);
      return;
    }

    this.filteredItems.forEach((item, index) => {
      const value = this.options.getValue(item);
      const isCached = this.options.isItemCached(item);
      
      const children = [value];
      if (isCached) {
        children.push(
          DOM.create('span', { class: 'lg-autosuggest__badge' }, ['✓'])
        );
      }

      const option = DOM.create('div', {
        class: 'lg-autosuggest__option',
        'data-value': value,
        'data-index': index
      }, children);

      if (index === this.selectedIndex) {
        option.classList.add('lg-autosuggest__option--selected');
      }

      this.dropdown.appendChild(option);
    });
  }

  selectNext() {
    if (this.filteredItems.length === 0) return;
    
    this.selectedIndex = Math.min(
      this.selectedIndex + 1,
      this.filteredItems.length - 1
    );
    
    this.updateSelection();
  }

  selectPrevious() {
    if (this.filteredItems.length === 0) return;
    
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.updateSelection();
  }

  selectCurrent() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredItems.length) {
      const item = this.filteredItems[this.selectedIndex];
      const value = this.options.getValue(item);
      this.selectValue(value);
    }
  }

  updateSelection() {
    const options = this.dropdown.querySelectorAll('.lg-autosuggest__option:not(.lg-autosuggest__option--empty)');
    
    options.forEach((opt, index) => {
      if (index === this.selectedIndex) {
        opt.classList.add('lg-autosuggest__option--selected');
        opt.scrollIntoView({ block: 'nearest' });
      } else {
        opt.classList.remove('lg-autosuggest__option--selected');
      }
    });
  }

  selectValue(value) {
    this.input.value = value;
    this.close();
    
    if (this.options.onSelect) {
      this.options.onSelect(value);
    }
    
    // Trigger change event
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  open() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.container.classList.add('lg-autosuggest--open');
    
    // Filter with current value
    this.filter(this.input.value || '');
  }

  close() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.container.classList.remove('lg-autosuggest--open');
    this.selectedIndex = -1;
  }

  setItems(items) {
    this.options.items = items;
    if (this.isOpen) {
      this.filter(this.input.value || '');
    }
  }

  setLoading(loading) {
    if (loading) {
      this.container.classList.add('lg-autosuggest--loading');
    } else {
      this.container.classList.remove('lg-autosuggest--loading');
    }
  }

  destroy() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    
    // Unwrap input
    const parent = this.container.parentNode;
    if (parent) {
      parent.insertBefore(this.input, this.container);
      DOM.remove(this.container);
    }
  }
}

/**
 * Create autosuggest from existing input
 */
export function createAutosuggest(input, options) {
  return new Autosuggest(input, options);
}
