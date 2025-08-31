export const EXT_ID = "your-org.vscode-lg";

export const VIEW_IDS = {
  control: "lg.control",
  included: "lg.included",
  stats:   "lg.stats",
  doctor:  "lg.doctor",
} as const;

export const CMD = {
  generateListing: "lg.generateListing",
  generateContext: "lg.generateContext",
  showIncluded:    "lg.showIncluded",
  showStats:       "lg.showStats",
  openConfig:      "lg.openConfig",
  createStarter:   "lg.createStarterConfig",
  runDoctor:       "lg.runDoctor",
  resetCache:      "lg.resetCache",
  toggleIncluded:  "lg.toggleIncludedViewMode",
} as const;

export const CFG_KEYS = {
  mode:            "lg.mode",
  defaultSection:  "lg.defaultSection",
  defaultTemplate: "lg.defaultTemplate",
  modelForStats:   "lg.modelForStats",
  pythonInterp:    "lg.python.interpreter",
  cliPath:         "lg.cli.path",
  installStrategy: "lg.install.strategy",
  autoUpdateCli:   "lg.autoUpdateCli",
  openAsEditable:  "lg.openAsEditable",
} as const;

export const STATE_KEYS = {
  control: "lg.control.state",
  includedViewMode: "lg.included.viewMode",
} as const;

export const DEFAULTS = {
  section: "all-src",
  mode: "all" as "all" | "changes",
  model: "o3",
} as const;
