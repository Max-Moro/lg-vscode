/* global LGUI */
(function () {
  const { DOM, Events, State } = LGUI;
  const vscode = State.getVSCode();

  // ---- unified state cache (session) ----
  // Try to instantly restore last selections (before TS sends data)
  const cached = State.get();
  if (cached && Object.keys(cached).length) {
    DOM.applyFormState(cached);
  }

  // ---- actions: one delegated handler for all buttons ----
  Events.delegate(document, "[data-action]", "click", (el) => {
    const type = el.getAttribute("data-action");
    if (!type) return;
    State.post(type);
  });

  // ---- state-bound controls (selects, radios) ----
  // Сохраняем в локальный стор для восстановления при перезагрузке
  Events.delegate(document, "[data-state-key]", "change", (el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;

    const value = el.value;
    const patch = { [key]: value };
    State.merge(patch);
  });

  // ---- state-bound textarea (live updates) ----
  Events.delegate(document, "textarea[data-state-key]", "input", Events.debounce((el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;
    
    const value = el.value;
    const patch = { [key]: value };
    State.merge(patch);
  }, 500)); // дебаунс 500ms для снижения частоты отправки

  // ---- специальный обработчик для смены библиотеки токенизации ----
  Events.delegate(document, "#tokenizerLib", "change", (el) => {
    const lib = el.value;
    
    // Сохраняем в локальный стор
    State.merge({ tokenizerLib: lib });
    
    // Уведомляем TS сторону о смене (чтобы перезагрузить энкодеры)
    State.post("tokenizerLibChanged", { lib });
  });

  // ---- валидация ctxLimit на клиенте ----
  Events.delegate(document, "#ctxLimit", "change", (el) => {
    const input = el;
    let value = parseInt(input.value, 10);
    
    // Проверяем границы
    if (isNaN(value) || value < 1000) {
      value = 1000;
    } else if (value > 2000000) {
      value = 2000000;
    }
    
    // Обновляем значение если было скорректировано
    if (input.value !== String(value)) {
      input.value = String(value);
    }
    
    // Сохраняем в локальный стор
    const patch = { ctxLimit: value };
    State.merge(patch);
  });

  // ---- Autosuggest for encoder ----
  let encoderAutosuggest = null;

  function setupEncoderAutosuggest(encoders, currentValue) {
    const input = DOM.qs("#encoder");
    if (!input) return;
    
    // Destroy old autosuggest if exists
    if (encoderAutosuggest) {
      encoderAutosuggest.destroy();
    }
    
    // Normalize encoders
    const items = (encoders || []).map(e => 
      typeof e === "string" ? { name: e, cached: false } : e
    );
    
    // Create new autosuggest using LGUI component
    encoderAutosuggest = LGUI.createAutosuggest(input, {
      items: items,
      getValue: (item) => item.name,
      isItemCached: (item) => item.cached,
      onSelect: (value) => {
        const patch = { encoder: value };
        State.merge(patch);
      }
    });
    
    // Set initial value
    if (currentValue !== undefined && currentValue !== null) {
      input.value = String(currentValue);
    }
  }

  // ---- handshake ----
  State.post("init");

  // ---- adaptive settings state ----
  let currentModeSets = [];
  let currentTagSets = [];
  let currentBranches = [];

  // ---- helper: collect full state from DOM ----
  function collectStateFromDOM() {
    // Начинаем с закэшированного состояния из State utilities
    const cached = State.get();
    
    // Собираем базовые поля форм через DOM.collectFormState()
    const formState = DOM.collectFormState();
    
    // Объединяем кэш и форму (форма перезаписывает кэш)
    const state = { ...cached, ...formState };
    
    // Специфичная логика для modes (не покрывается data-state-key)
    const modes = {};
    DOM.qsa(".mode-select").forEach(select => {
      const modeSetId = select.dataset.modeSet;
      if (modeSetId && select.value) {
        modes[modeSetId] = select.value;
      }
    });
    if (Object.keys(modes).length > 0) {
      state.modes = modes;
    }
    
    // Специфичная логика для tags (не покрывается data-state-key)
    const tags = {};
    currentTagSets.forEach(tagSet => {
      const selectedTags = [];
      (tagSet.tags || []).forEach(tag => {
        const compositeKey = `${tagSet.id}--${tag.id}`;
        const checkbox = DOM.qs(`#tag-${compositeKey}`);
        if (checkbox && checkbox.checked) {
          selectedTags.push(tag.id);
        }
      });
      if (selectedTags.length > 0) {
        tags[tagSet.id] = selectedTags;
      }
    });
    if (Object.keys(tags).length > 0) {
      state.tags = tags;
    }
    
    return state;
  }

  // ---- runtime updates from extension ----
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "getState") {
      // Handle state request from extension (pull model)
      const state = collectStateFromDOM();
      State.post("stateResponse", { requestId: msg.requestId, state });
      return;
    }
    if (msg?.type === "data") {
      // fill selects with remote lists
      // Если значение из state есть - используем его, иначе выберется первый элемент
      LGUI.fillSelect(DOM.qs("#section"), msg.sections, { 
        value: msg.state.section,
        keepValue: true 
      });
      LGUI.fillSelect(DOM.qs("#template"), msg.contexts, { 
        value: msg.state.template,
        keepValue: true 
      });
      
      // fill tokenization selects
      LGUI.fillSelect(DOM.qs("#tokenizerLib"), msg.tokenizerLibs || [], { 
        value: msg.state.tokenizerLib,
        keepValue: true 
      });
      
      // fill encoder autosuggest (supports custom values)
      setupEncoderAutosuggest(msg.encoders, msg.state.encoder);

      // populate adaptive settings
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);
      
      // populate branches
      if (msg.branches) {
        currentBranches = msg.branches;
        populateBranches(msg.branches);
      }

      applyState(msg.state);
    } else if (msg?.type === "encodersUpdated") {
      // Обновление списка энкодеров после смены библиотеки токенизации
      const state = State.get();
      setupEncoderAutosuggest(msg.encoders, state.encoder);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function applyState(s) {
    if (!s) return;
    
    // Apply basic form fields through DOM utilities
    DOM.applyFormState(s);
    
    // Apply modes state (специфичная логика)
    if (s.modes !== undefined) {
      applyModesState(s.modes);
    }
    
    // Apply tags state (специфичная логика)
    if (s.tags !== undefined) {
      applyTagsState(s.tags);
    }
    
    // Merge into local cache
    State.merge(s);
    
    // Update target branch visibility based on current modes
    updateTargetBranchVisibility();
  }

  // ---- adaptive settings functions ----
  function populateModeSets(modeSetsData) {
    currentModeSets = modeSetsData?.["mode-sets"] || [];
    const container = DOM.qs("#mode-sets-container");
    container.innerHTML = "";
    
    if (!currentModeSets.length) {
      container.innerHTML = '<div class="empty-state">No mode sets available</div>';
      return;
    }
    
    currentModeSets.forEach(modeSet => {
      const div = document.createElement("div");
      div.className = "mode-set";
      
      const label = document.createElement("label");
      label.className = "mode-set-label";
      label.textContent = modeSet.title || modeSet.id;
      
      const select = document.createElement("select");
      select.id = `mode-${modeSet.id}`;
      select.dataset.modeSet = modeSet.id;
      select.className = "lg-select mode-select";
      
      // Add mode options
      (modeSet.modes || []).forEach(mode => {
        const option = document.createElement("option");
        option.value = mode.id;
        option.textContent = mode.title || mode.id;
        if (mode.description) {
          option.title = mode.description;
        }
        select.appendChild(option);
      });
      
      // Add change listener
      select.addEventListener("change", onModeChange);
      
      div.appendChild(label);
      div.appendChild(select);
      container.appendChild(div);
    });
  }

  function populateTagSets(tagSetsData) {
    // Filter out global tags as they are already handled by modes and shouldn't be configured separately
    currentTagSets = (tagSetsData?.["tag-sets"] || []).filter(tagSet => tagSet.id !== "global");
    const container = DOM.qs("#tag-sets-container");
    container.innerHTML = "";
    
    if (!currentTagSets.length) {
      container.innerHTML = '<div class="empty-state">No tag sets available</div>';
      return;
    }
    
    currentTagSets.forEach(tagSet => {
      const div = document.createElement("div");
      div.className = "tag-set";
      
      const title = document.createElement("h4");
      title.className = "tag-set-title";
      title.innerHTML = `<span class="codicon codicon-folder"></span>${tagSet.title || tagSet.id}`;
      
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "tag-set-tags";
      
      (tagSet.tags || []).forEach(tag => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "tag-item";
        
        // Use composite key to avoid ID conflicts when same tag appears in multiple sets
        // Use '--' as separator (not ':') to avoid CSS selector issues
        const compositeKey = `${tagSet.id}--${tag.id}`;
        const domId = `tag-${compositeKey}`;
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = domId;
        checkbox.value = tag.id;
        checkbox.dataset.tagSetId = tagSet.id;
        checkbox.addEventListener("change", onTagChange);
        
        const label = document.createElement("label");
        label.className = "tag-item-label";
        label.htmlFor = domId;
        label.textContent = tag.title || tag.id;
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        
        if (tag.description) {
          const desc = document.createElement("div");
          desc.className = "tag-item-description";
          desc.textContent = tag.description;
          itemDiv.appendChild(desc);
        }
        
        tagsContainer.appendChild(itemDiv);
      });
      
      div.appendChild(title);
      div.appendChild(tagsContainer);
      container.appendChild(div);
    });
  }

  function applyModesState(modes) {
    currentModeSets.forEach(modeSet => {
      const select = DOM.qs(`#mode-${modeSet.id}`);
      if (select && modeSet.modes && modeSet.modes.length > 0) {
        // Use saved mode or default to first available mode
        const savedMode = modes[modeSet.id];
        const defaultMode = modeSet.modes[0].id;
        select.value = savedMode || defaultMode;
        
        // If we're using the default, save it to state
        if (!savedMode) {
          onModeChangeInternal(modeSet.id, defaultMode);
        }
      }
    });
  }

  function applyTagsState(tags) {
    // tags это Record<string, string[]> (tagSetId -> [tagId, ...])
    const tagsBySet = tags || {};
    
    currentTagSets.forEach(tagSet => {
      const selectedTagsInSet = tagsBySet[tagSet.id] || [];
      
      (tagSet.tags || []).forEach(tag => {
        const compositeKey = `${tagSet.id}--${tag.id}`;
        const checkbox = DOM.qs(`#tag-${compositeKey}`);
        if (checkbox) {
          checkbox.checked = selectedTagsInSet.includes(tag.id);
        }
      });
    });
  }

  function onModeChangeInternal(modeSetId, modeId) {
    const cached = State.get();
    const modes = cached.modes || {};
    
    modes[modeSetId] = modeId;
    
    const patch = { modes };
    State.merge(patch);
  }

  function onModeChange(event) {
    const select = event.target;
    const modeSetId = select.dataset.modeSet;
    const modeId = select.value;
    
    onModeChangeInternal(modeSetId, modeId);
    
    // Update target branch visibility when mode changes
    updateTargetBranchVisibility();
  }

  function onTagChange() {
    // Собираем теги по наборам: Record<tagSetId, tagId[]>
    const tagsBySet = {};
    
    currentTagSets.forEach(tagSet => {
      const selectedInSet = [];
      
      (tagSet.tags || []).forEach(tag => {
        const compositeKey = `${tagSet.id}--${tag.id}`;
        const checkbox = DOM.qs(`#tag-${compositeKey}`);
        if (checkbox && checkbox.checked) {
          selectedInSet.push(tag.id);
        }
      });
      
      // Добавляем набор только если в нем есть выбранные теги
      if (selectedInSet.length > 0) {
        tagsBySet[tagSet.id] = selectedInSet;
      }
    });
    
    const patch = { tags: tagsBySet };
    State.merge(patch);
  }

  function populateBranches(branches) {
    const select = DOM.qs("#targetBranch");
    if (!select) return;
    
    LGUI.fillSelect(select, branches, {
      getValue: it => (typeof it === "string" ? it : (it?.name ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.name ?? "")),
      keepValue: true
    });
  }

  function updateTargetBranchVisibility() {
    const container = DOM.qs("#target-branch-container");
    if (!container) return;
    
    // Check if any mode set has "review" mode selected
    let hasReviewMode = false;
    currentModeSets.forEach(modeSet => {
      const select = DOM.qs(`#mode-${modeSet.id}`);
      if (select && select.value === "review") {
        hasReviewMode = true;
      }
    });
    
    container.style.display = hasReviewMode ? "flex" : "none";
  }

  // ---- tags panel management ----
  function showTagsPanel() {
    const panel = DOM.qs("#tags-panel");
    panel.style.display = "flex";
  }

  function hideTagsPanel() {
    const panel = DOM.qs("#tags-panel");
    panel.style.display = "none";
  }

  // ---- additional action handlers ----
  Events.delegate(document, "#tags-toggle", "click", showTagsPanel);
  Events.delegate(document, "#tags-close", "click", hideTagsPanel);
  
  // Close tags panel when clicking outside (but not on the button)
  Events.delegate(document, "#tags-panel", "click", (el, event) => {
    if (event.target === el) {
      hideTagsPanel();
    }
  });
})();
