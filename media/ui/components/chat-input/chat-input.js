/**
 * Chat Input Component
 * Auto-expanding textarea for AI-style inputs
 */

import { DOM } from '../../utils/dom.js';
import { Events } from '../../utils/events.js';

export class ChatInput {
  constructor(textarea, options = {}) {
    this.textarea = typeof textarea === 'string' ? DOM.qs(textarea) : textarea;
    
    if (!this.textarea) {
      throw new Error('ChatInput: textarea element not found');
    }

    this.options = {
      placeholder: 'Describe current task',
      minHeight: 42,
      maxHeight: 120,
      onInput: null,
      onChange: null,
      ...options
    };

    this.cleanups = [];
    this.init();
  }

  init() {
    this.textarea.classList.add('lg-chat-input');
    
    if (this.options.placeholder) {
      this.textarea.placeholder = this.options.placeholder;
    }

    this.bindEvents();
  }

  bindEvents() {
    if (this.options.onInput) {
      this.cleanups.push(
        Events.on(this.textarea, 'input', Events.debounce(() => {
          if (this.options.onInput) {
            this.options.onInput(this.textarea.value);
          }
        }, 300))
      );
    }

    if (this.options.onChange) {
      this.cleanups.push(
        Events.on(this.textarea, 'change', () => {
          if (this.options.onChange) {
            this.options.onChange(this.textarea.value);
          }
        })
      );
    }
  }

  getValue() {
    return this.textarea.value;
  }

  setValue(value) {
    this.textarea.value = value;
  }

  clear() {
    this.textarea.value = '';
  }

  focus() {
    this.textarea.focus();
  }

  destroy() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
  }
}

/**
 * Enhance existing textarea
 */
export function createChatInput(textarea, options) {
  return new ChatInput(textarea, options);
}
