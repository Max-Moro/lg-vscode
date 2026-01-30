/* global LGUI */
(function () {
  const { DOM, Events, State } = LGUI;

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
  // Save to local storage for restoration on reload
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
  }, 500)); // debounce 500ms to reduce send frequency

  // ---- special handler for tokenizer library change ----
  Events.delegate(document, "#tokenizerLib", "change", (el) => {
    const lib = el.value;

    // Save to local storage
    State.merge({ tokenizerLib: lib });

    // Notify TS side of the change (to reload encoders)
    State.post("tokenizerLibChanged", { lib });
  });

  // ---- special handler for provider change ----
  Events.delegate(document, "#provider", "change", (el) => {
    const providerId = el.value;
    State.merge({ providerId });
    State.post("providerChanged", { providerId });
  });

  // ---- special handler for context (template) change ----
  Events.delegate(document, "#template", "change", (el) => {
    const template = el.value;
    State.merge({ template });
    State.post("contextChanged", { template });
  });

  // ---- client-side validation of ctxLimit ----
  Events.delegate(document, "#ctxLimit", "change", (el) => {
    const input = el;
    let value = parseInt(input.value, 10);

    // Check boundaries
    if (isNaN(value) || value < 1000) {
      value = 1000;
    } else if (value > 2000000) {
      value = 2000000;
    }

    // Update value if it was corrected
    if (input.value !== String(value)) {
      input.value = String(value);
    }

    // Save to local storage
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
    // Start with cached state from State utilities
    const cached = State.get();

    // Collect basic form fields via DOM.collectFormState()
    const formState = DOM.collectFormState();

    // Merge cache and form (form overwrites cache)
    const state = { ...cached, ...formState };

    // Specific logic for modes (not covered by data-state-key)
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

    // Specific logic for tags (not covered by data-state-key)
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
    if (msg?.type === "stateUpdate") {
      // Handle state updates from other sources (e.g., Stats webview)
      applyState(msg.state);
      return;
    }
    if (msg?.type === "data") {
      // fill selects with remote lists
      // If value from state exists - use it, otherwise the first element will be selected
      LGUI.fillSelect(DOM.qs("#section"), msg.sections, {
        value: msg.state.section,
        keepValue: true
      });
      LGUI.fillSelect(DOM.qs("#template"), msg.contexts, {
        value: msg.state.template,
        keepValue: true
      });

      // fill providers
      LGUI.fillSelect(DOM.qs("#provider"), msg.providers || [], {
        getValue: it => it.id,
        getLabel: it => it.name,
        value: msg.state.providerId,
        keepValue: true
      });
      
      // fill tokenization selects
      LGUI.fillSelect(DOM.qs("#tokenizerLib"), msg.tokenizerLibs || [], { 
        value: msg.state.tokenizerLib,
        keepValue: true 
      });
      
      // fill encoder autosuggest (supports custom values)
      setupEncoderAutosuggest(msg.encoders, msg.state.encoder);

      // populate branches first (needed for target branch)
      if (msg.branches) {
        currentBranches = msg.branches;
      }

      // populate adaptive settings (includes target branch)
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);
      
      // populate CLI settings
      if (msg.cliShells) {
        populateCliShells(msg.cliShells);
      }
      
      if (msg.claudeModels) {
        populateClaudeModels(msg.claudeModels);
      }

      if (msg.claudeIntegrationMethods) {
        populateClaudeIntegrationMethods(msg.claudeIntegrationMethods);
      }

      if (msg.codexReasoningEfforts) {
        populateCodexReasoningEfforts(msg.codexReasoningEfforts);
      }

      applyState(msg.state);
      
    } else if (msg?.type === "encodersUpdated") {
      // Update encoder list after tokenizer library change
      const state = State.get();
      setupEncoderAutosuggest(msg.encoders, state.encoder);
    } else if (msg?.type === "providerDataUpdate") {
      // Update contexts list with validated template from server
      LGUI.fillSelect(DOM.qs("#template"), msg.contexts, {
        value: msg.template,  // Use server-validated template
        keepValue: true
      });

      // Update local state if template changed
      if (msg.template !== undefined) {
        State.merge({ template: msg.template });
      }

      // Update mode-sets and tag-sets
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);

      // Apply modes/tags from server (flat format for current context/provider)
      if (msg.modes) applyModesState(msg.modes);
      if (msg.tags) applyTagsState(msg.tags);

      // Update local cache with effective modes/tags
      State.merge({ modes: msg.modes || {}, tags: msg.tags || {} });

      // Update CLI block visibility
      const cliBlock = DOM.qs("#cli-settings-block");
      if (cliBlock) {
        cliBlock.style.display = msg.showCliSettings ? "flex" : "none";
      }

    } else if (msg?.type === "contextDataUpdate") {
      // Update mode-sets and tag-sets
      populateModeSets(msg.modeSets);
      populateTagSets(msg.tagSets);

      // Apply modes/tags from server (flat format for current context/provider)
      if (msg.modes) applyModesState(msg.modes);
      if (msg.tags) applyTagsState(msg.tags);

      // Update local cache with effective modes/tags
      State.merge({ modes: msg.modes || {}, tags: msg.tags || {} });
    } else if (msg?.type === "theme") {
      document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
    }
  });

  function applyState(s) {
    if (!s) return;

    // Apply basic form fields through DOM utilities
    DOM.applyFormState(s);

    // Apply modes state (specific logic)
    if (s.modes !== undefined) {
      applyModesState(s.modes);
    }

    // Apply tags state (specific logic)
    if (s.tags !== undefined) {
      applyTagsState(s.tags);
    }

    // Update CLI settings visibility based on provider
    if (s.providerId !== undefined) {
      const cliBlock = DOM.qs("#cli-settings-block");
      const claudeSettings = DOM.qs("#claude-settings-container");
      const codexSettings = DOM.qs("#codex-settings-container");

      if (cliBlock) {
        const shouldShow = s.providerId && s.providerId.endsWith(".cli");
        cliBlock.style.display = shouldShow ? "flex" : "none";

        if (claudeSettings) {
          claudeSettings.style.display = (s.providerId === "com.anthropic.claude.cli") ? "flex" : "none";
        }
        if (codexSettings) {
          codexSettings.style.display = (s.providerId === "com.openai.codex.cli") ? "flex" : "none";
        }
      }
    }

    // Merge into local cache
    State.merge(s);

    // Update target branch visibility based on current modes
    updateTargetBranch();
  }

  // ---- adaptive settings functions ----
  function populateModeSets(modeSetsData) {
    currentModeSets = modeSetsData?.["mode-sets"] || [];
    const container = DOM.qs("#mode-sets-row");
    if (!container) return;

    container.innerHTML = "";

    if (!currentModeSets.length) {
      container.innerHTML = '<div class="empty-state">No mode sets available</div>';
      return;
    }

    currentModeSets.forEach(modeSet => {
      // Use .cluster for inline layout (label + select side by side)
      const cluster = document.createElement("span");
      cluster.className = "cluster";

      const label = document.createElement("label");
      label.textContent = (modeSet.title || modeSet.id) + ":";

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

      cluster.appendChild(label);
      cluster.appendChild(select);
      container.appendChild(cluster);
    });

    // Add target branch selector if needed
    updateTargetBranch();
  }

  function updateTargetBranch() {
    const container = DOM.qs("#mode-sets-row");
    if (!container) return;

    // Check if review mode is active
    let hasReviewMode = false;
    currentModeSets.forEach(modeSet => {
      const select = DOM.qs(`#mode-${modeSet.id}`);
      if (select && select.value === "review") {
        hasReviewMode = true;
      }
    });

    // Remove existing target branch if present
    const existingBranch = DOM.qs("#target-branch-cluster");
    if (existingBranch) {
      existingBranch.remove();
    }

    // Add target branch if review mode is active
    if (hasReviewMode && currentBranches.length > 0) {
      const cluster = document.createElement("span");
      cluster.id = "target-branch-cluster";
      cluster.className = "cluster";

      const label = document.createElement("label");
      label.textContent = "Target Branch:";

      const select = document.createElement("select");
      select.id = "targetBranch";
      select.dataset.stateKey = "targetBranch";
      select.className = "lg-select";

      // Populate branches
      currentBranches.forEach(branch => {
        const option = document.createElement("option");
        option.value = branch;
        option.textContent = branch;
        select.appendChild(option);
      });

      // Restore saved value
      const state = State.get();
      if (state.targetBranch && currentBranches.includes(state.targetBranch)) {
        select.value = state.targetBranch;
      }

      // Add change listener
      select.addEventListener("change", () => {
        State.merge({ targetBranch: select.value });
      });

      cluster.appendChild(label);
      cluster.appendChild(select);
      container.appendChild(cluster);
    }
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

    // Get current state to check for selected tags
    const state = State.get();
    const currentTags = state.tags || {};

    currentTagSets.forEach(tagSet => {
      const div = document.createElement("div");
      div.className = "tag-set";

      // Check if this tag-set has any selected tags
      const hasSelectedTags = (currentTags[tagSet.id] || []).length > 0;

      // Auto-expand if has selected tags
      if (hasSelectedTags) {
        div.classList.add("expanded");
      }

      // Create collapsible header
      const header = document.createElement("div");
      header.className = "tag-set-header";

      const chevron = document.createElement("span");
      chevron.className = "codicon codicon-chevron-right tag-set-chevron";

      const title = document.createElement("span");
      title.className = "tag-set-title";
      title.textContent = tagSet.title || tagSet.id;

      header.appendChild(chevron);
      header.appendChild(title);

      // Toggle collapse/expand on header click
      header.addEventListener("click", () => {
        div.classList.toggle("expanded");
      });

      // Create tags container
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

      div.appendChild(header);
      div.appendChild(tagsContainer);
      container.appendChild(div);
    });
  }

  function applyModesState(modes) {
    currentModeSets.forEach(modeSet => {
      const select = DOM.qs(`#mode-${modeSet.id}`);
      if (select && modeSet.modes && modeSet.modes.length > 0) {
        const savedMode = modes[modeSet.id];
        const defaultMode = modeSet.modes[0].id;

        // Check if saved mode is valid (exists in current mode-set)
        const availableModeIds = modeSet.modes.map(m => m.id);
        const isValidSavedMode = savedMode && availableModeIds.includes(savedMode);

        // Use saved mode if valid, otherwise default to first
        const effectiveMode = isValidSavedMode ? savedMode : defaultMode;
        select.value = effectiveMode;

        // Update state if saved mode was invalid or missing
        if (!isValidSavedMode) {
          onModeChangeInternal(modeSet.id, defaultMode);
        }
      }
    });
  }

  function applyTagsState(tags) {
    // tags is Record<string, string[]> (tagSetId -> [tagId, ...])
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

    // Update tags button text with current selection count
    updateTagsButtonText(tagsBySet);
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
    updateTargetBranch();
  }

  function onTagChange() {
    // Collect tags by sets: Record<tagSetId, tagId[]>
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

      // Add set only if it has selected tags
      if (selectedInSet.length > 0) {
        tagsBySet[tagSet.id] = selectedInSet;
      }
    });

    const patch = { tags: tagsBySet };
    State.merge(patch);

    // Update tags button text with selection count
    updateTagsButtonText(tagsBySet);
  }

  /**
   * Update tags button text to show selection count
   */
  function updateTagsButtonText(tagsBySet) {
    const button = DOM.qs("#tags-toggle .btn-text");
    if (!button) return;

    const totalSelected = Object.values(tagsBySet || {})
      .reduce((sum, tags) => sum + tags.length, 0);

    if (totalSelected > 0) {
      button.textContent = `Configure Tags (${totalSelected})`;
    } else {
      button.textContent = "Configure Tags";
    }
  }

  // ---- CLI settings functions ----
  function populateCliShells(shells) {
    const select = DOM.qs("#cliShell");
    if (!select) return;
    
    LGUI.fillSelect(select, shells, {
      getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
      keepValue: true
    });
  }
  
  function populateClaudeModels(models) {
    const select = DOM.qs("#claudeModel");
    if (!select) return;

    LGUI.fillSelect(select, models, {
      getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
      getDescription: it => (typeof it === "string" ? "" : (it?.description ?? "")),
      keepValue: true
    });
  }

  function populateClaudeIntegrationMethods(methods) {
    const select = DOM.qs("#claudeIntegrationMethod");
    if (!select) return;

    LGUI.fillSelect(select, methods, {
      getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
      getDescription: it => (typeof it === "string" ? "" : (it?.description ?? "")),
      keepValue: true
    });
  }

  function populateCodexReasoningEfforts(efforts) {
    const select = DOM.qs("#codexReasoningEffort");
    if (!select) return;

    LGUI.fillSelect(select, efforts, {
      getValue: it => (typeof it === "string" ? it : (it?.id ?? "")),
      getLabel: it => (typeof it === "string" ? it : (it?.label ?? it?.id ?? "")),
      getDescription: it => (typeof it === "string" ? "" : (it?.description ?? "")),
      keepValue: true
    });
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
