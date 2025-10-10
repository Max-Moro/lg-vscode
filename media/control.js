/* global LGUI */
(function () {
  const { DOM, Events, State } = LGUI;
  const vscode = State.getVSCode();

  // ---- unified state cache (session) ----
  // Try to instantly restore last selections (before TS sends data)
  const cached = State.get();
  if (cached && Object.keys(cached).length) {
    applyStateToDOM(cached);
  }

  // ---- helper: apply state to DOM ----
  function applyStateToDOM(state) {
    for (const [key, value] of Object.entries(state)) {
      const el = document.getElementById(key);
      if (el && 'value' in el) {
        el.value = String(value);
      }
    }
  }

  // ---- actions: one delegated handler for all buttons ----
  Events.delegate(document, "[data-action]", "click", (el) => {
    const type = el.getAttribute("data-action");
    if (!type) return;
    State.post(type);
  });

  // ---- state-bound controls (selects, radios) ----
  Events.delegate(document, "[data-state-key]", "change", (el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;

    const value = el.value;
    const patch = { [key]: value };
    State.merge(patch);
    State.post("setState", { state: patch });
  });

  // ---- state-bound textarea (live updates) ----
  Events.delegate(document, "textarea[data-state-key]", "input", Events.debounce((el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;
    
    const value = el.value;
    const patch = { [key]: value };
    State.merge(patch);
    State.post("setState", { state: patch });
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
    
    // Сохраняем
    const patch = { ctxLimit: value };
    State.merge(patch);
    State.post("setState", { state: patch });
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
        State.post("setState", { state: patch });
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

  // ---- runtime updates from extension ----
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      // fill selects with remote lists
      LGUI.fillSelect(DOM.qs("#section"), msg.sections, { value: msg.state.section || "" });
      LGUI.fillSelect(DOM.qs("#template"), msg.contexts, { value: msg.state.template || "" });
      
      // fill tokenization selects
      LGUI.fillSelect(DOM.qs("#tokenizerLib"), msg.tokenizerLibs || [], { 
        value: msg.state.tokenizerLib || "tiktoken" 
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
    } else if (msg?.type === "aiProviderStatus") {
      // Обновляем отображение текущего провайдера
      const nameEl = document.getElementById("ai-provider-name");
      if (nameEl) {
        nameEl.textContent = msg.providerName || "Not configured";
      }
    } else if (msg?.type === "state") {
      // обновление списка энкодеров после смены библиотеки
      const state = State.get();
      setupEncoderAutosuggest(msg.encoders, state.encoder);
    } else if (msg?.type === "state") {
      applyState(msg.state);
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function applyState(s) {
    const next = {};
    if (s.section !== undefined) next["section"] = s.section;
    if (s.template !== undefined) next["template"] = s.template;
    
    // Apply tokenization state
    if (s.tokenizerLib !== undefined) next["tokenizerLib"] = s.tokenizerLib;
    if (s.encoder !== undefined) next["encoder"] = s.encoder;
    if (s.ctxLimit !== undefined) next["ctxLimit"] = s.ctxLimit;
    
    if (s.taskText !== undefined) next["taskText"] = s.taskText;
    if (s.targetBranch !== undefined) next["targetBranch"] = s.targetBranch;
    
    // Apply modes state
    if (s.modes) {
      applyModesState(s.modes);
    }
    
    // Apply tags state
    if (s.tags) {
      applyTagsState(s.tags);
    }
    
    if (Object.keys(next).length) {
      applyStateToDOM(next);
      State.merge(next); // keep cache in sync with authoritative state
    }
    
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
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `tag-${tag.id}`;
        checkbox.value = tag.id;
        checkbox.addEventListener("change", onTagChange);
        
        const label = document.createElement("label");
        label.className = "tag-item-label";
        label.htmlFor = `tag-${tag.id}`;
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
    const tagIds = Array.isArray(tags) ? tags : [];
    
    currentTagSets.forEach(tagSet => {
      (tagSet.tags || []).forEach(tag => {
        const checkbox = DOM.qs(`#tag-${tag.id}`);
        if (checkbox) {
          checkbox.checked = tagIds.includes(tag.id);
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
    State.post("setState", { state: patch });
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
    const selectedTags = [];
    
    currentTagSets.forEach(tagSet => {
      (tagSet.tags || []).forEach(tag => {
        const checkbox = DOM.qs(`#tag-${tag.id}`);
        if (checkbox && checkbox.checked) {
          selectedTags.push(tag.id);
        }
      });
    });
    
    const patch = { tags: selectedTags };
    State.merge(patch);
    State.post("setState", { state: patch });
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
