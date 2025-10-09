/**
 * Button Component
 */

import { DOM } from '../../utils/dom.js';
import { Events } from '../../utils/events.js';

export class Button {
  constructor(options = {}) {
    this.options = {
      text: '',
      icon: null,
      variant: 'default', // 'default' | 'primary'
      size: 'default', // 'sm' | 'default' | 'lg'
      disabled: false,
      onClick: null,
      ...options
    };
    
    this.element = this.render();
    this.bindEvents();
  }

  render() {
    const classes = ['lg-btn'];
    
    if (this.options.variant === 'primary') {
      classes.push('lg-btn--primary');
    }
    
    if (this.options.size !== 'default') {
      classes.push(`lg-btn--${this.options.size}`);
    }
    
    if (this.options.icon && !this.options.text) {
      classes.push('lg-btn--icon-only');
    }

    const children = [];
    
    if (this.options.icon) {
      children.push(
        DOM.create('span', { class: 'lg-btn__icon codicon codicon-' + this.options.icon })
      );
    }
    
    if (this.options.text) {
      children.push(
        DOM.create('span', { class: 'lg-btn__text' }, [this.options.text])
      );
    }

    const button = DOM.create('button', {
      class: classes.join(' '),
      type: 'button',
      disabled: this.options.disabled,
      title: this.options.title || ''
    }, children);

    return button;
  }

  bindEvents() {
    if (this.options.onClick) {
      Events.on(this.element, 'click', (e) => {
        if (!this.options.disabled) {
          this.options.onClick(e);
        }
      });
    }
  }

  setDisabled(disabled) {
    this.options.disabled = disabled;
    this.element.disabled = disabled;
  }

  setText(text) {
    this.options.text = text;
    const textEl = this.element.querySelector('.lg-btn__text');
    if (textEl) {
      textEl.textContent = text;
    }
  }

  destroy() {
    DOM.remove(this.element);
  }
}

/**
 * Create button from HTML element
 */
export function enhanceButton(element, options = {}) {
  // Add base class
  element.classList.add('lg-btn');
  
  // Apply variant
  if (options.variant === 'primary') {
    element.classList.add('lg-btn--primary');
  }
  
  // Apply size
  if (options.size && options.size !== 'default') {
    element.classList.add(`lg-btn--${options.size}`);
  }
  
  // Wrap text nodes in span for ellipsis
  Array.from(element.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const span = DOM.create('span', { class: 'lg-btn__text' }, [node.textContent]);
      element.replaceChild(span, node);
    }
  });
  
  return element;
}
