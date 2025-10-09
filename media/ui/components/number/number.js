/**
 * Number Input Component
 */

export function enhanceNumber(element, options = {}) {
  element.classList.add('lg-input', 'lg-input--number');
  element.type = 'number';
  
  if (options.min !== undefined) {
    element.min = String(options.min);
  }
  if (options.max !== undefined) {
    element.max = String(options.max);
  }
  if (options.step !== undefined) {
    element.step = String(options.step);
  }
  
  return element;
}
