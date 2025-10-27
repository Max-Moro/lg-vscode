/**
 * DOM Utilities for LG UI Components
 */

export const DOM = {
  /**
   * Query selector shorthand
   */
  qs(selector, root = document) {
    return root.querySelector(selector);
  },

  /**
   * Query selector all (returns array)
   */
  qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  },

  /**
   * Create element with attributes and children
   */
  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    
    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class' || key === 'className') {
        el.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key.startsWith('data-')) {
        el.setAttribute(key, value);
      } else if (key in el) {
        el[key] = value;
      } else {
        el.setAttribute(key, value);
      }
    });
    
    // Append children
    children.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
    
    return el;
  },

  /**
   * Remove element from DOM
   */
  remove(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  },

  /**
   * Get closest ancestor matching selector
   */
  closest(el, selector) {
    return el?.closest?.(selector) || null;
  },

  /**
   * Check if element matches selector
   */
  matches(el, selector) {
    return el?.matches?.(selector) || false;
  },

  /**
   * Get element position relative to viewport
   */
  getRect(el) {
    return el?.getBoundingClientRect() || { top: 0, left: 0, width: 0, height: 0 };
  },

  /**
   * CSS escape for selectors
   */
  cssEscape(str) {
    return String(str).replace(/["'\\]/g, '\\$&');
  },

  /**
   * Collect form values from elements with data-state-key attribute
   * @param {Element} root - Root element to search within (default: document)
   * @returns {Object} Key-value pairs from form controls
   */
  collectFormState(root = document) {
    const state = {};
    
    this.qsa('[data-state-key]', root).forEach(el => {
      const key = el.getAttribute('data-state-key');
      if (!key) return;
      
      if (el.tagName === 'SELECT') {
        state[key] = el.value;
      } else if (el.tagName === 'INPUT') {
        if (el.type === 'checkbox') {
          state[key] = el.checked;
        } else if (el.type === 'radio') {
          if (el.checked) {
            state[key] = el.value;
          }
        } else if (el.type === 'number') {
          state[key] = parseInt(el.value, 10) || 0;
        } else {
          state[key] = el.value;
        }
      } else if (el.tagName === 'TEXTAREA') {
        state[key] = el.value;
      }
    });
    
    return state;
  },

  /**
   * Apply state values to form controls with data-state-key attribute
   * @param {Object} state - State object with key-value pairs
   * @param {Element} root - Root element to search within (default: document)
   */
  applyFormState(state, root = document) {
    if (!state || typeof state !== 'object') return;
    
    this.qsa('[data-state-key]', root).forEach(el => {
      const key = el.getAttribute('data-state-key');
      if (!key || !(key in state)) return;
      
      const value = state[key];
      
      if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.value = String(value ?? '');
      } else if (el.tagName === 'INPUT') {
        if (el.type === 'checkbox') {
          el.checked = Boolean(value);
        } else if (el.type === 'radio') {
          el.checked = el.value === String(value);
        } else {
          el.value = String(value ?? '');
        }
      }
    });
  }
};
