/**
 * Event Utilities for LG UI Components
 */

export const Events = {
  /**
   * Add event listener
   */
  on(el, type, handler, options) {
    el?.addEventListener(type, handler, options);
    return () => el?.removeEventListener(type, handler, options);
  },

  /**
   * Add one-time event listener
   */
  once(el, type, handler, options) {
    const wrapper = (e) => {
      handler(e);
      el?.removeEventListener(type, wrapper, options);
    };
    el?.addEventListener(type, wrapper, options);
    return () => el?.removeEventListener(type, wrapper, options);
  },

  /**
   * Event delegation
   */
  delegate(root, selector, type, handler, options) {
    const wrapper = (e) => {
      const target = e.target?.closest?.(selector);
      if (target && root.contains(target)) {
        handler(target, e);
      }
    };
    root?.addEventListener(type, wrapper, options);
    return () => root?.removeEventListener(type, wrapper, options);
  },

  /**
   * Debounce function
   */
  debounce(fn, delay = 200) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * Throttle function
   */
  throttle(fn, delay = 200) {
    let last = 0;
    let pending;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      } else {
        clearTimeout(pending);
        pending = setTimeout(() => {
          last = Date.now();
          fn(...args);
        }, delay - (now - last));
      }
    };
  },

  /**
   * Create custom event
   */
  create(name, detail = {}, options = {}) {
    return new CustomEvent(name, {
      bubbles: true,
      cancelable: true,
      detail,
      ...options
    });
  },

  /**
   * Dispatch custom event
   */
  dispatch(el, name, detail = {}, options = {}) {
    const event = this.create(name, detail, options);
    return el?.dispatchEvent(event);
  }
};
