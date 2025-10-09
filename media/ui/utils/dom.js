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
  }
};
