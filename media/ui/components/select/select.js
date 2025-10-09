/**
 * Select Component
 */

import { DOM } from '../../utils/dom.js';

export function fillSelect(select, items, options = {}) {
  const { getValue, getLabel, keepValue, value } = options;
  const current = select.value;
  
  select.innerHTML = '';
  
  for (const item of items || []) {
    const val = getValue ? getValue(item) : (typeof item === 'string' ? item : (item?.id ?? item?.value ?? ''));
    const label = getLabel ? getLabel(item) : (typeof item === 'string' ? item : (item?.label ?? item?.text ?? val));
    
    const option = document.createElement('option');
    option.value = String(val);
    option.textContent = String(label);
    select.appendChild(option);
  }
  
  const target = value !== undefined ? value : (keepValue ? current : undefined);
  if (target !== undefined) {
    select.value = String(target);
  }
  
  if (!select.value && select.options.length) {
    select.selectedIndex = 0;
  }
}

export function enhanceSelect(element) {
  element.classList.add('lg-select');
  return element;
}
