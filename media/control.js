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

  // ---- handshake ----
  UI.post(vscode, "init");

  // ---- adaptive settings state ----
  let currentModeSets = [];
  let currentTagSets = [];

  // ---- runtime updates from extension ----
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "data") {
      // fill selects with remote lists
      UI.fillSelect(UI.qs("#section"), msg.sections, { value: msg.state.section || "" });
      UI.fillSelect(UI.qs("#template"), msg.contexts, { value: msg.state.template || "" });
      UI.fillSelect(UI.qs("#model"), msg.models || [], {
        getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
        getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
        value: msg.state.model || ""
      });

      // populate adaptive settings
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);

      applyState(msg.state);
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
    if (s.model !== undefined) next["model"] = s.model;
    
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
    currentTagSets = tagSetsData?.["tag-sets"] || [];
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
