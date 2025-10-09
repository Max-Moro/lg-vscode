/**
 * Toolbar Component
 * Container for horizontal action bars
 */

import { DOM } from '../../utils/dom.js';

export class Toolbar {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? DOM.qs(container) : container;
    
    if (!this.container) {
      throw new Error('Toolbar: container element not found');
    }

    this.options = {
      variant: 'default', // 'default' | 'compact' | 'dense'
      items: [],
      ...options
    };

    this.init();
  }

  init() {
    this.container.classList.add('lg-toolbar');
    
    if (this.options.variant !== 'default') {
      this.container.classList.add(`lg-toolbar--${this.options.variant}`);
    }

    // Add initial items if provided
    if (this.options.items && this.options.items.length > 0) {
      this.options.items.forEach(item => this.addItem(item));
    }
  }

  /**
   * Add item to toolbar
   * @param {HTMLElement|string} item - Element or 'separator' | 'spacer'
   */
  addItem(item) {
    if (item === 'separator') {
      const sep = DOM.create('div', { class: 'lg-toolbar__separator' });
      this.container.appendChild(sep);
    } else if (item === 'spacer') {
      const spacer = DOM.create('div', { class: 'lg-toolbar__spacer' });
      this.container.appendChild(spacer);
    } else if (item instanceof HTMLElement) {
      this.container.appendChild(item);
    }
  }

  /**
   * Clear all items from toolbar
   */
  clear() {
    this.container.innerHTML = '';
  }

  /**
   * Get all button elements in toolbar
   */
  getButtons() {
    return Array.from(this.container.querySelectorAll('.lg-btn'));
  }

  destroy() {
    this.container.classList.remove('lg-toolbar');
    if (this.options.variant !== 'default') {
      this.container.classList.remove(`lg-toolbar--${this.options.variant}`);
    }
  }
}

/**
 * Enhance existing element as toolbar
 */
export function enhanceToolbar(element, options = {}) {
  return new Toolbar(element, options);
}
