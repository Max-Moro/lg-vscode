/**
 * Control Panel Renderer - Stateless UI rendering from ViewModel
 *
 * This module implements a diff-based renderer that:
 * - Receives ViewModel updates from TypeScript layer
 * - Minimizes DOM updates through change detection
 * - Converts user events to Commands sent back to TypeScript
 */
/* global LGUI */
(function () {
  const { DOM, Events } = LGUI;

  // ========== State ==========
  /** @type {object|null} Last rendered ViewModel for diffing */
  let lastViewModel = null;

  /** @type {Function|null} Command callback to TypeScript */
  let commandCallback = null;

  /** @type {object|null} Encoder autosuggest instance */
  let encoderAutosuggest = null;

  // ========== VS Code API ==========
  // @ts-ignore - acquireVsCodeApi is injected by VS Code
  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

  function postMessage(msg) {
    if (vscode) {
      vscode.postMessage(msg);
    }
  }

  // ========== Renderer API ==========

  /**
   * Main render function - called when ViewModel changes
   * Uses diff to minimize DOM updates
   * @param {object} vm - ViewModel from TypeScript
   */
  function render(vm) {
    const prev = lastViewModel;
    lastViewModel = vm;

    // Diff-based updates for each section
    renderProviders(vm, prev);
    renderContexts(vm, prev);
    renderSections(vm, prev);
    renderModeSets(vm, prev);
    renderTagSets(vm, prev);
    renderTargetBranch(vm, prev);
    renderTokenization(vm, prev);
    renderCliSettings(vm, prev);
    renderTask(vm, prev);
  }

  /**
   * Update UI meta state (loading overlay)
   * @param {object} meta - UIMeta from TypeScript
   */
  function setMeta(meta) {
    const overlay = DOM.qs("#loading-overlay");
    if (overlay) {
      overlay.style.display = meta.isLoading ? "flex" : "none";
    }
  }

  /**
   * Subscribe to user commands
   * @param {Function} callback - Callback receiving Command objects
   */
  function onCommand(callback) {
    commandCallback = callback;
  }

  // ========== Section Renderers ==========

  function renderProviders(vm, prev) {
    if (prev && arraysEqual(prev.providers, vm.providers) &&
        prev.selectedProviderId === vm.selectedProviderId) {
      return;
    }

    const select = DOM.qs("#provider");
    if (!select) return;

    // Update options only if list changed
    if (!prev || !arraysEqual(prev.providers, vm.providers)) {
      LGUI.fillSelect(select, vm.providers, {
        getValue: (p) => p.value,
        getLabel: (p) => p.label
      });
    }

    // Update selection
    if (select.value !== vm.selectedProviderId) {
      select.value = vm.selectedProviderId;
    }
  }

  function renderContexts(vm, prev) {
    if (prev && arraysEqual(prev.contexts, vm.contexts) &&
        prev.selectedContextId === vm.selectedContextId) {
      return;
    }

    const select = DOM.qs("#template");
    if (!select) return;

    if (!prev || !arraysEqual(prev.contexts, vm.contexts)) {
      LGUI.fillSelect(select, vm.contexts, {
        getValue: (c) => c.value,
        getLabel: (c) => c.label
      });
    }

    if (select.value !== vm.selectedContextId) {
      select.value = vm.selectedContextId;
    }
  }

  function renderSections(vm, prev) {
    if (prev && arraysEqual(prev.sections, vm.sections) &&
        prev.selectedSectionId === vm.selectedSectionId) {
      return;
    }

    const select = DOM.qs("#section");
    if (!select) return;

    if (!prev || !arraysEqual(prev.sections, vm.sections)) {
      LGUI.fillSelect(select, vm.sections, {
        getValue: (s) => s.value,
        getLabel: (s) => s.label
      });
    }

    if (select.value !== vm.selectedSectionId) {
      select.value = vm.selectedSectionId;
    }
  }

  function renderModeSets(vm, prev) {
    const container = DOM.qs("#mode-sets-row");
    if (!container) return;

    // Check if structure changed (different mode-sets or different modes within)
    const structureChanged = !prev || !modeSetsStructureEqual(prev.modeSets, vm.modeSets);

    if (structureChanged) {
      // Full rebuild
      container.innerHTML = buildModeSetsHtml(vm.modeSets);
    } else {
      // Just update selections
      vm.modeSets.forEach((ms) => {
        const select = DOM.qs(`#mode-${ms.id}`, container);
        if (select && select.value !== ms.selectedModeId) {
          select.value = ms.selectedModeId;
        }
      });
    }
  }

  function renderTagSets(vm, prev) {
    const container = DOM.qs("#tag-sets-container");
    if (!container) return;

    // Check if structure changed
    const structureChanged = !prev || !tagSetsStructureEqual(prev.tagSets, vm.tagSets);

    if (structureChanged) {
      container.innerHTML = buildTagSetsHtml(vm.tagSets);
    } else {
      // Just update checked state and expanded state
      vm.tagSets.forEach((ts) => {
        const tagSetEl = DOM.qs(`[data-tag-set-id="${ts.id}"]`, container);
        if (tagSetEl) {
          // Update expanded state
          if (ts.expanded && !tagSetEl.classList.contains("expanded")) {
            tagSetEl.classList.add("expanded");
          } else if (!ts.expanded && tagSetEl.classList.contains("expanded")) {
            tagSetEl.classList.remove("expanded");
          }
        }

        ts.tags.forEach((tag) => {
          const checkbox = DOM.qs(`#tag-${ts.id}--${tag.id}`, container);
          if (checkbox && checkbox.checked !== tag.checked) {
            checkbox.checked = tag.checked;
          }
        });
      });
    }

    // Update button visibility and text
    const btn = DOM.qs("#tags-toggle");
    if (btn) {
      btn.style.display = vm.tagsButtonVisible ? "" : "none";
      const btnText = DOM.qs(".btn-text", btn);
      if (btnText) {
        btnText.textContent = vm.selectedTagsCount > 0
          ? `Configure Tags (${vm.selectedTagsCount})`
          : "Configure Tags";
      }
    }
  }

  function renderTargetBranch(vm, prev) {
    const cluster = DOM.qs("#target-branch-cluster");
    const container = DOM.qs("#mode-sets-row");

    // Handle visibility
    if (!vm.targetBranchVisible) {
      if (cluster) cluster.remove();
      return;
    }

    // Create if doesn't exist
    if (!cluster && container) {
      container.insertAdjacentHTML("beforeend", buildTargetBranchHtml(vm));
      return;
    }

    if (!cluster) return;

    // Update options and selection
    const select = DOM.qs("#targetBranch", cluster);
    if (!select) return;

    if (!prev || !arraysEqual(prev.branches, vm.branches)) {
      LGUI.fillSelect(select, vm.branches, {
        getValue: (b) => b.value,
        getLabel: (b) => b.label
      });
    }

    if (select.value !== vm.selectedBranch) {
      select.value = vm.selectedBranch;
    }
  }

  function renderTokenization(vm, prev) {
    // Tokenizer lib
    const libSelect = DOM.qs("#tokenizerLib");
    if (libSelect) {
      if (!prev || !arraysEqual(prev.tokenizerLibs, vm.tokenizerLibs)) {
        LGUI.fillSelect(libSelect, vm.tokenizerLibs, {
          getValue: (l) => l.value,
          getLabel: (l) => l.label
        });
      }
      if (libSelect.value !== vm.selectedTokenizerLib) {
        libSelect.value = vm.selectedTokenizerLib;
      }
    }

    // Encoder autosuggest
    const encoderInput = DOM.qs("#encoder");
    if (encoderInput) {
      // Update autosuggest items if encoders changed
      if (!prev || !arraysEqual(prev.encoders, vm.encoders)) {
        setupEncoderAutosuggest(vm.encoders, vm.selectedEncoder);
      } else if (encoderInput.value !== vm.selectedEncoder) {
        encoderInput.value = vm.selectedEncoder;
      }
    }

    // Context limit
    const ctxLimitInput = DOM.qs("#ctxLimit");
    if (ctxLimitInput && ctxLimitInput.value !== String(vm.ctxLimit)) {
      ctxLimitInput.value = String(vm.ctxLimit);
    }
  }

  function renderCliSettings(vm, prev) {
    const block = DOM.qs("#cli-settings-block");
    if (!block) return;

    // Visibility
    block.style.display = vm.cliSettingsVisible ? "flex" : "none";
    if (!vm.cliSettingsVisible) return;

    // CLI Scope
    const scopeInput = DOM.qs("#cliScope");
    if (scopeInput && scopeInput.value !== vm.cliScope) {
      scopeInput.value = vm.cliScope;
    }

    // Shell
    const shellSelect = DOM.qs("#cliShell");
    if (shellSelect) {
      if (!prev || !arraysEqual(prev.cliShells, vm.cliShells)) {
        LGUI.fillSelect(shellSelect, vm.cliShells, {
          getValue: (s) => s.value,
          getLabel: (s) => s.label
        });
      }
      if (shellSelect.value !== vm.selectedShell) {
        shellSelect.value = vm.selectedShell;
      }
    }

    // Claude settings
    const claudeContainer = DOM.qs("#claude-settings-container");
    if (claudeContainer) {
      claudeContainer.style.display = vm.claudeSettingsVisible ? "flex" : "none";

      if (vm.claudeSettingsVisible) {
        const modelSelect = DOM.qs("#claudeModel");
        if (modelSelect) {
          if (!prev || !arraysEqual(prev.claudeModels, vm.claudeModels)) {
            LGUI.fillSelect(modelSelect, vm.claudeModels, {
              getValue: (m) => m.value,
              getLabel: (m) => m.label
            });
          }
          if (modelSelect.value !== vm.selectedClaudeModel) {
            modelSelect.value = vm.selectedClaudeModel;
          }
        }

        const methodSelect = DOM.qs("#claudeIntegrationMethod");
        if (methodSelect) {
          if (!prev || !arraysEqual(prev.claudeMethods, vm.claudeMethods)) {
            LGUI.fillSelect(methodSelect, vm.claudeMethods, {
              getValue: (m) => m.value,
              getLabel: (m) => m.label
            });
          }
          if (methodSelect.value !== vm.selectedClaudeMethod) {
            methodSelect.value = vm.selectedClaudeMethod;
          }
        }
      }
    }

    // Codex settings
    const codexContainer = DOM.qs("#codex-settings-container");
    if (codexContainer) {
      codexContainer.style.display = vm.codexSettingsVisible ? "flex" : "none";

      if (vm.codexSettingsVisible) {
        const reasoningSelect = DOM.qs("#codexReasoningEffort");
        if (reasoningSelect) {
          if (!prev || !arraysEqual(prev.codexReasoningEfforts, vm.codexReasoningEfforts)) {
            LGUI.fillSelect(reasoningSelect, vm.codexReasoningEfforts, {
              getValue: (r) => r.value,
              getLabel: (r) => r.label
            });
          }
          if (reasoningSelect.value !== vm.selectedCodexReasoning) {
            reasoningSelect.value = vm.selectedCodexReasoning;
          }
        }
      }
    }
  }

  function renderTask(vm, prev) {
    const textarea = DOM.qs("#taskText");
    if (textarea && textarea.value !== vm.taskText) {
      textarea.value = vm.taskText;
    }
  }

  // ========== Encoder Autosuggest ==========

  function setupEncoderAutosuggest(encoders, currentValue) {
    const input = DOM.qs("#encoder");
    if (!input) return;

    // Destroy old autosuggest if exists
    if (encoderAutosuggest) {
      encoderAutosuggest.destroy();
    }

    // Normalize encoders
    const items = (encoders || []).map(e =>
      typeof e === "string" ? { name: e, cached: false } : { name: e.value, cached: e.cached }
    );

    // Create new autosuggest using LGUI component
    encoderAutosuggest = LGUI.createAutosuggest(input, {
      items: items,
      getValue: (item) => item.name,
      isItemCached: (item) => item.cached,
      onSelect: (value) => {
        emitCommand({ type: "SET_ENCODER", encoder: value });
      }
    });

    // Set initial value
    if (currentValue !== undefined && currentValue !== null) {
      input.value = String(currentValue);
    }
  }

  // ========== HTML Builders ==========

  function buildModeSetsHtml(modeSets) {
    if (!modeSets || modeSets.length === 0) {
      return "";
    }

    return modeSets.map((ms) => `
      <span class="cluster">
        <label>${escapeHtml(ms.title)}:</label>
        <select id="mode-${escapeHtml(ms.id)}" data-mode-set="${escapeHtml(ms.id)}" class="lg-select mode-select">
          ${ms.modes.map((m) => `
            <option value="${escapeHtml(m.id)}" ${m.id === ms.selectedModeId ? "selected" : ""}
                    ${m.description ? `title="${escapeHtml(m.description)}"` : ""}>
              ${escapeHtml(m.title)}
            </option>
          `).join("")}
        </select>
      </span>
    `).join("");
  }

  function buildTagSetsHtml(tagSets) {
    if (!tagSets || tagSets.length === 0) {
      return '<div class="empty-state">No tag sets available</div>';
    }

    return tagSets.map((ts) => `
      <div class="tag-set ${ts.expanded ? "expanded" : ""}" data-tag-set-id="${escapeHtml(ts.id)}">
        <div class="tag-set-header">
          <span class="codicon codicon-chevron-right tag-set-chevron"></span>
          <span class="tag-set-title">${escapeHtml(ts.title)}</span>
        </div>
        <div class="tag-set-tags">
          ${ts.tags.map((tag) => `
            <div class="tag-item">
              <input type="checkbox" id="tag-${escapeHtml(ts.id)}--${escapeHtml(tag.id)}"
                     data-tag-set="${escapeHtml(ts.id)}" data-tag="${escapeHtml(tag.id)}"
                     ${tag.checked ? "checked" : ""}>
              <label class="tag-item-label" for="tag-${escapeHtml(ts.id)}--${escapeHtml(tag.id)}">
                ${escapeHtml(tag.title)}
              </label>
              ${tag.description ? `<div class="tag-item-description">${escapeHtml(tag.description)}</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function buildTargetBranchHtml(vm) {
    return `
      <span id="target-branch-cluster" class="cluster">
        <label>Target Branch:</label>
        <select id="targetBranch" class="lg-select">
          ${vm.branches.map((b) => `
            <option value="${escapeHtml(b.value)}" ${b.value === vm.selectedBranch ? "selected" : ""}>
              ${escapeHtml(b.label)}
            </option>
          `).join("")}
        </select>
      </span>
    `;
  }

  // ========== Diff Helpers ==========

  function arraysEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => {
      if (typeof item === "object" && item !== null) {
        return JSON.stringify(item) === JSON.stringify(b[i]);
      }
      return item === b[i];
    });
  }

  function modeSetsStructureEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((msA, i) => {
      const msB = b[i];
      return msA.id === msB.id &&
             msA.modes.length === msB.modes.length &&
             msA.modes.every((mA, j) => mA.id === msB.modes[j].id);
    });
  }

  function tagSetsStructureEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((tsA, i) => {
      const tsB = b[i];
      return tsA.id === tsB.id &&
             tsA.tags.length === tsB.tags.length &&
             tsA.tags.every((tA, j) => tA.id === tsB.tags[j].id);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ========== Command Emission ==========

  function emitCommand(cmd) {
    if (commandCallback) {
      commandCallback(cmd);
    }
    // Also send to VS Code
    postMessage({ type: "command", command: cmd });
  }

  // ========== Event Handling ==========

  function selectToCommand(el) {
    const id = el.id;
    const value = el.value;

    switch (id) {
      case "provider":
        return { type: "provider/SELECT", providerId: value };
      case "template":
        return { type: "context/SELECT", template: value };
      case "section":
        return { type: "section/SELECT", section: value };
      case "targetBranch":
        return { type: "adaptive/SELECT_BRANCH", branch: value };
      case "tokenizerLib":
        return { type: "tokenization/SELECT_LIB", lib: value };
      case "cliShell":
        return { type: "provider/SELECT_CLI_SHELL", shell: value };
      case "claudeModel":
        return { type: "provider.claude-cli/SELECT_MODEL", model: value };
      case "claudeIntegrationMethod":
        return { type: "provider.claude-cli/SELECT_METHOD", method: value };
      case "codexReasoningEffort":
        return { type: "provider.codex-cli/SELECT_REASONING", effort: value };
      default:
        // Mode select
        if (id && id.startsWith("mode-")) {
          const modeSetId = el.dataset.modeSet;
          if (modeSetId) {
            return { type: "adaptive/SELECT_MODE", modeSetId, modeId: value };
          }
        }
        return null;
    }
  }

  function checkboxToCommand(el) {
    const tagSetId = el.dataset.tagSet;
    const tagId = el.dataset.tag;
    if (tagSetId && tagId) {
      return { type: "adaptive/TOGGLE_TAG", tagSetId, tagId };
    }
    return null;
  }

  function inputToCommand(el) {
    const id = el.id;
    const value = el.value;

    switch (id) {
      case "taskText":
        return { type: "context/SET_TASK", text: value };
      case "encoder":
        return { type: "tokenization/SET_ENCODER", encoder: value };
      case "ctxLimit":
        return { type: "tokenization/SET_CTX_LIMIT", limit: parseInt(value, 10) || 0 };
      case "cliScope":
        return { type: "provider/SET_CLI_SCOPE", scope: value };
      default:
        return null;
    }
  }

  function setupEventDelegation() {
    // Select changes → immediate command
    Events.delegate(document, "select", "change", (el) => {
      const cmd = selectToCommand(el);
      if (cmd) {
        emitCommand(cmd);
      }
    });

    // Checkbox changes → immediate command
    Events.delegate(document, "input[type=checkbox]", "change", (el) => {
      const cmd = checkboxToCommand(el);
      if (cmd) {
        emitCommand(cmd);
      }
    });

    // Text input → debounced command
    Events.delegate(document, "textarea, input[type=text], input[type=number]", "input",
      Events.debounce((el) => {
        const cmd = inputToCommand(el);
        if (cmd) {
          emitCommand(cmd);
        }
      }, 300)
    );

    // Tag set header click → toggle expand (local UI state)
    Events.delegate(document, ".tag-set-header", "click", (el) => {
      const tagSet = el.closest(".tag-set");
      if (tagSet) {
        tagSet.classList.toggle("expanded");
      }
    });

    // Tags panel toggle
    Events.delegate(document, "#tags-toggle", "click", () => {
      const panel = DOM.qs("#tags-panel");
      if (panel) {
        panel.style.display = "flex";
      }
    });

    Events.delegate(document, "#tags-close", "click", () => {
      const panel = DOM.qs("#tags-panel");
      if (panel) {
        panel.style.display = "none";
      }
    });

    // Close tags panel when clicking outside
    Events.delegate(document, "#tags-panel", "click", (el, event) => {
      if (event.target === el) {
        el.style.display = "none";
      }
    });

    // Action buttons
    Events.delegate(document, "[data-action]", "click", (el) => {
      const action = el.getAttribute("data-action");
      if (action) {
        postMessage({ type: action });
      }
    });
  }

  // ========== Message Handling ==========

  function handleMessage(event) {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "render":
        render(msg.viewModel);
        break;
      case "setMeta":
        setMeta(msg.meta);
        break;
      case "theme":
        document.documentElement.dataset.vscodeThemeKind = String(msg.kind);
        break;
    }
  }

  // ========== Initialization ==========

  function init() {
    setupEventDelegation();
    window.addEventListener("message", handleMessage);

    // Export renderer API for direct access (testing/debugging)
    window.ControlPanelRenderer = { render, setMeta, onCommand };

    // Signal ready to TypeScript
    postMessage({ type: "rendererReady" });
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
