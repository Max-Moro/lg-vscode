/* global UI */
(function () {
  const vscode = UI.acquire();

  // ---- unified state cache (session) ----
  const store = UI.stateStore(vscode, "lg.control.uiState");

  // Try to instantly restore last selections (before TS sends data)
  const cached = store.get();
  if (cached && Object.keys(cached).length) {
    UI.setState(cached);
  }



  // ---- actions: one delegated handler for all buttons ----
  UI.delegate(document, "[data-action]", "click", (el) => {
    const type = el.getAttribute("data-action");
    if (!type) return;
    UI.post(vscode, type);
  });

  // ---- state-bound controls (selects, radios) ----
  UI.delegate(document, "[data-state-key]", "change", (el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;

    // Radios: читаем через UI.getState для корректной группировки по name
    let value;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      value = UI.getState([key])[key];
    } else {
      value = /** @type {HTMLSelectElement|HTMLInputElement} */(el).value;
    }
    const patch = { [key]: value };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  });

  // ---- state-bound textarea (live updates) ----
  UI.delegate(document, "textarea[data-state-key]", "input", UI.debounce((el) => {
    const key = el.getAttribute("data-state-key");
    if (!key) return;
    
    const value = el.value;
    const patch = { [key]: value };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  }, 500)); // дебаунс 500ms для снижения частоты отправки

  // ---- специальный обработчик для смены библиотеки токенизации ----
  UI.delegate(document, "#tokenizerLib", "change", (el) => {
    const lib = el.value;
    
    // Сохраняем в локальный стор
    store.merge({ tokenizerLib: lib });
    
    // Уведомляем TS сторону о смене (чтобы перезагрузить энкодеры)
    UI.post(vscode, "tokenizerLibChanged", { lib });
  });

  // ---- валидация ctxLimit на клиенте ----
  UI.delegate(document, "#ctxLimit", "change", (el) => {
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
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  });

  // ---- autosadgest теперь использует кастомный dropdown (см. setupAutosadgestDropdown выше) ----

  // ---- custom autosadgest implementation ----
  let currentEncoders = [];
  let dropdownVisible = false;

  function fillEncoderDatalist(encoders, currentValue) {
    const input = UI.qs("#encoder");
    if (!input) return;
    
    // Store encoders for filtering
    currentEncoders = (encoders || []).map(e => 
      typeof e === "string" ? { name: e, cached: false } : e
    );
    
    // Set input value (allow custom values)
    if (currentValue !== undefined && currentValue !== null) {
      input.value = String(currentValue);
    }
    
    // Setup dropdown if not exists
    setupAutosadgestDropdown();
  }

  function setupAutosadgestDropdown() {
    const wrapper = UI.qs(".lg-autosadgest");
    if (!wrapper) return;
    
    // Remove old dropdown if exists
    const oldDropdown = wrapper.querySelector(".lg-autosadgest__dropdown");
    if (oldDropdown) oldDropdown.remove();
    
    // Create dropdown
    const dropdown = document.createElement("div");
    dropdown.className = "lg-autosadgest__dropdown";
    wrapper.appendChild(dropdown);
    
    const input = wrapper.querySelector(".lg-input--autosadgest");
    if (!input) return;
    
    // Show dropdown on focus/click
    const showDropdown = () => {
      updateDropdownOptions(input.value || "");
      dropdown.classList.add("show");
      dropdownVisible = true;
    };
    
    // Hide dropdown
    const hideDropdown = () => {
      dropdown.classList.remove("show");
      dropdownVisible = false;
    };
    
    // Update dropdown options based on filter
    const updateDropdownOptions = (filter) => {
      const lowerFilter = filter.toLowerCase();
      const filtered = currentEncoders.filter(e => 
        e.name.toLowerCase().includes(lowerFilter)
      );
      
      dropdown.innerHTML = "";
      
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lg-autosadgest__option";
        empty.textContent = filter ? "No matches" : "No encoders available";
        empty.style.fontStyle = "italic";
        empty.style.color = "var(--vscode-descriptionForeground)";
        dropdown.appendChild(empty);
        return;
      }
      
      filtered.forEach(encoder => {
        const option = document.createElement("div");
        option.className = "lg-autosadgest__option" + (encoder.cached ? " cached" : "");
        option.textContent = encoder.name;
        option.dataset.value = encoder.name;
        
        option.addEventListener("click", () => {
          input.value = encoder.name;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          hideDropdown();
          input.focus();
        });
        
        dropdown.appendChild(option);
      });
    };
    
    // Event handlers
    input.addEventListener("focus", showDropdown);
    input.addEventListener("click", showDropdown);
    
    input.addEventListener("input", () => {
      if (dropdownVisible) {
        updateDropdownOptions(input.value || "");
      }
    });
    
    input.addEventListener("blur", () => {
      // Delay to allow click on option
      setTimeout(hideDropdown, 200);
    });
    
    // Keyboard navigation
    input.addEventListener("keydown", (e) => {
      if (!dropdownVisible) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          showDropdown();
          e.preventDefault();
        }
        return;
      }
      
      const options = Array.from(dropdown.querySelectorAll(".lg-autosadgest__option[data-value]"));
      if (!options.length) return;
      
      const selected = dropdown.querySelector(".lg-autosadgest__option.selected");
      let index = selected ? options.indexOf(selected) : -1;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        index = Math.min(index + 1, options.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        index = Math.max(index - 1, 0);
      } else if (e.key === "Enter" && selected) {
        e.preventDefault();
        input.value = selected.dataset.value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        hideDropdown();
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        hideDropdown();
        return;
      }
      
      // Update selection
      options.forEach(opt => opt.classList.remove("selected"));
      if (index >= 0 && index < options.length) {
        options[index].classList.add("selected");
        options[index].scrollIntoView({ block: "nearest" });
      }
    });
  }

  // ---- handshake ----
  UI.post(vscode, "init");

  // ---- adaptive settings state ----
  let currentModeSets = [];
  let currentTagSets = [];
  let currentBranches = [];

  // ---- runtime updates from extension ----
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      // fill selects with remote lists
      UI.fillSelect(UI.qs("#section"), msg.sections, { value: msg.state.section || "" });
      UI.fillSelect(UI.qs("#template"), msg.contexts, { value: msg.state.template || "" });
      
      // fill tokenization selects
      UI.fillSelect(UI.qs("#tokenizerLib"), msg.tokenizerLibs || [], { 
        value: msg.state.tokenizerLib || "tiktoken" 
      });
      
      // fill encoder datalist (supports custom values)
      fillEncoderDatalist(msg.encoders, msg.state.encoder);

      // populate adaptive settings
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);
      
      // populate branches
      if (msg.branches) {
        currentBranches = msg.branches;
        populateBranches(msg.branches);
      }

      applyState(msg.state);
    } else if (msg?.type === "encoders") {
      // обновление списка энкодеров после смены библиотеки
      const state = store.get();
      fillEncoderDatalist(msg.encoders, state.encoder);
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
      UI.setState(next);
      store.merge(next); // keep cache in sync with authoritative state
    }
    
    // Update target branch visibility based on current modes
    updateTargetBranchVisibility();
  }

  // ---- adaptive settings functions ----
  function populateModeSets(modeSetsData) {
    currentModeSets = modeSetsData?.["mode-sets"] || [];
    const container = UI.qs("#mode-sets-container");
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
      select.className = "mode-select";
      
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
    const container = UI.qs("#tag-sets-container");
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
      const select = UI.qs(`#mode-${modeSet.id}`);
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
        const checkbox = UI.qs(`#tag-${tag.id}`);
        if (checkbox) {
          checkbox.checked = tagIds.includes(tag.id);
        }
      });
    });
  }

  function onModeChangeInternal(modeSetId, modeId) {
    const cached = store.get();
    const modes = cached.modes || {};
    
    modes[modeSetId] = modeId;
    
    const patch = { modes };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
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
        const checkbox = UI.qs(`#tag-${tag.id}`);
        if (checkbox && checkbox.checked) {
          selectedTags.push(tag.id);
        }
      });
    });
    
    const patch = { tags: selectedTags };
    store.merge(patch);
    UI.post(vscode, "setState", { state: patch });
  }

  function populateBranches(branches) {
    const select = UI.qs("#targetBranch");
    if (!select) return;
    
    UI.fillSelect(select, branches, {
      getValue: it => (typeof it === "string" ? it : (it?.name ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.name ?? "")),
      keepValue: true
    });
  }

  function updateTargetBranchVisibility() {
    const container = UI.qs("#target-branch-container");
    if (!container) return;
    
    // Check if any mode set has "review" mode selected
    let hasReviewMode = false;
    currentModeSets.forEach(modeSet => {
      const select = UI.qs(`#mode-${modeSet.id}`);
      if (select && select.value === "review") {
        hasReviewMode = true;
      }
    });
    
    container.style.display = hasReviewMode ? "flex" : "none";
  }

  // ---- tags panel management ----
  function showTagsPanel() {
    const panel = UI.qs("#tags-panel");
    panel.style.display = "flex";
  }

  function hideTagsPanel() {
    const panel = UI.qs("#tags-panel");
    panel.style.display = "none";
  }

  // ---- additional action handlers ----
  UI.delegate(document, "#tags-toggle", "click", showTagsPanel);
  UI.delegate(document, "#tags-close", "click", hideTagsPanel);
  
  // Close tags panel when clicking outside (but not on the button)
  UI.delegate(document, "#tags-panel", "click", (el, event) => {
    if (event.target === el) {
      hideTagsPanel();
    }
  });
})();
