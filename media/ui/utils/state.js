/**
 * State Management Utilities for LG UI Components
 */

export const State = {
  /**
   * Get VS Code API instance (cached)
   */
  getVSCode() {
    if (!this._vscode && typeof acquireVsCodeApi === 'function') {
      this._vscode = acquireVsCodeApi();
    }
    return this._vscode;
  },

  /**
   * Post message to VS Code extension
   */
  post(type, payload = {}) {
    const vscode = this.getVSCode();
    if (vscode) {
      vscode.postMessage({ type, ...payload });
    }
  },

  /**
   * Get persistent state from VS Code
   */
  get() {
    const vscode = this.getVSCode();
    if (vscode && typeof vscode.getState === 'function') {
      return vscode.getState() || {};
    }
    // Fallback to localStorage
    try {
      return JSON.parse(localStorage.getItem('__lg_ui_state__') || '{}');
    } catch {
      return {};
    }
  },

  /**
   * Set persistent state in VS Code
   */
  set(state) {
    const vscode = this.getVSCode();
    if (vscode && typeof vscode.setState === 'function') {
      vscode.setState(state || {});
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem('__lg_ui_state__', JSON.stringify(state || {}));
      } catch {}
    }
    return state || {};
  },

  /**
   * Merge partial state
   */
  merge(partial) {
    return this.set({ ...this.get(), ...partial });
  },

  /**
   * Clear all state
   */
  clear() {
    return this.set({});
  },

  /**
   * Create reactive state proxy
   */
  reactive(initialState = {}, onChange) {
    const handlers = {
      get(target, prop) {
        return target[prop];
      },
      set(target, prop, value) {
        const oldValue = target[prop];
        target[prop] = value;
        if (onChange && oldValue !== value) {
          onChange(prop, value, oldValue);
        }
        return true;
      }
    };
    return new Proxy({ ...initialState }, handlers);
  }
};

// Private cache
State._vscode = null;
