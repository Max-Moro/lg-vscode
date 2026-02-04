/**
 * Generator for ai-interaction.sec.yaml template file.
 *
 * Collects supported modes from all registered AI providers
 * and generates/updates the canonical integration meta-section.
 */
import * as fs from "fs";
import * as path from "path";
import { AiIntegrationService } from "./AiIntegrationService";
import { effectiveWorkspaceRoot } from "../../cli/CliResolver";
import { logInfo, logDebug } from "../../logging/log";

/**
 * Mode metadata (without runs).
 */
interface ModeMeta {
  title: string;
  description?: string;
  tags?: string[];
}

/**
 * Parsed mode data from existing file.
 * Includes metadata and preserves provider order.
 */
interface ParsedModeData {
  meta: ModeMeta;
  /** Providers in original order from file */
  providerOrder: string[];
  runs: Map<string, string>;
}

/**
 * Canonical mode definitions with metadata.
 */
const CANONICAL_MODES: Record<string, ModeMeta> = {
  ask: {
    title: "Ask",
    description: "Question-answer mode"
  },
  agent: {
    title: "Agent",
    description: "Agent mode with tools",
    tags: ["agent"]
  },
  plan: {
    title: "Plan",
    description: "Planning / specification mode",
    tags: ["agent", "plan"]
  }
};

/**
 * Generates and updates ai-interaction.sec.yaml file.
 */
export class AiModesTemplateGenerator {
  private readonly aiService: AiIntegrationService;

  constructor(aiService: AiIntegrationService) {
    this.aiService = aiService;
  }

  /**
   * Generates or updates the ai-interaction.sec.yaml file.
   *
   * Merge logic:
   * - Preserves unknown modes and providers
   * - Updates only runs for known providers
   * - Adds new modes if not present
   *
   * @returns Path to generated file
   * @throws Error if workspace root not found or write fails
   */
  async generate(): Promise<string> {
    const root = effectiveWorkspaceRoot();
    if (!root) {
      throw new Error("No workspace root found");
    }

    const lgCfgPath = path.join(root, "lg-cfg");
    const filePath = path.join(lgCfgPath, "ai-interaction.sec.yaml");

    logInfo(`[AiModesTemplateGenerator] Generating ${filePath}`);

    // Ensure lg-cfg directory exists
    if (!fs.existsSync(lgCfgPath)) {
      fs.mkdirSync(lgCfgPath, { recursive: true });
      logDebug("[AiModesTemplateGenerator] Created lg-cfg directory");
    }

    // Collect modes from all providers
    const allModes = this.aiService.getAllSupportedModes();
    logDebug(`[AiModesTemplateGenerator] Collected modes for ${allModes.size} mode types`);

    // Read existing file if present
    let existingContent = "";
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, "utf-8");
      logDebug("[AiModesTemplateGenerator] Read existing file");
    }

    // Merge and generate new content
    const newContent = this.mergeAndGenerate(existingContent, allModes);

    // Write file
    fs.writeFileSync(filePath, newContent, "utf-8");
    logInfo(`[AiModesTemplateGenerator] Written ${filePath}`);

    return filePath;
  }

  /**
   * Merges existing content with new modes data.
   *
   * Uses simple line-based parsing to preserve formatting and comments.
   * Preserves:
   * - Metadata (title, description, tags) for custom modes
   * - Provider order from existing file
   */
  private mergeAndGenerate(
    existingContent: string,
    allModes: Map<string, Map<string, string>>
  ): string {
    // If no existing content, generate fresh
    if (!existingContent.trim()) {
      return this.generateFreshFromProviderModes(allModes);
    }

    // Parse existing modes with full metadata and provider order
    const existingModes = this.parseExistingModes(existingContent);

    // Merge: new providers override, unknown providers preserved
    for (const [modeId, newProviders] of allModes) {
      if (!existingModes.has(modeId)) {
        // New mode - create with default metadata
        existingModes.set(modeId, {
          meta: CANONICAL_MODES[modeId] || { title: modeId },
          providerOrder: [],
          runs: new Map()
        });
      }

      const modeData = existingModes.get(modeId);
      if (!modeData) {
        continue;
      }

      // Merge providers, preserving order
      for (const [providerId, runs] of newProviders) {
        // Update runs value
        modeData.runs.set(providerId, runs);

        // Add to order if new provider
        if (!modeData.providerOrder.includes(providerId)) {
          modeData.providerOrder.push(providerId);
        }
      }
    }

    // Regenerate with merged data
    return this.generateFreshFromParsedModes(existingModes);
  }

  /**
   * Parses existing YAML to extract full mode data including metadata and provider order.
   *
   * Simple line-based parsing (not full YAML parser to preserve formatting).
   */
  private parseExistingModes(content: string): Map<string, ParsedModeData> {
    const result = new Map<string, ParsedModeData>();

    let currentMode: string | null = null;
    let currentMeta: ModeMeta = { title: "" };
    let inRuns = false;

    for (const line of content.split("\n")) {
      // Detect mode start (8 spaces indent)
      const modeMatch = line.match(/^ {8}(\w+):\s*$/);
      if (modeMatch) {
        currentMode = modeMatch[1];
        currentMeta = { title: currentMode }; // Default title to modeId
        inRuns = false;
        result.set(currentMode, {
          meta: currentMeta,
          providerOrder: [],
          runs: new Map()
        });
        continue;
      }

      // Parse mode metadata (10 spaces indent)
      if (currentMode && !inRuns) {
        // Parse title
        const titleMatch = line.match(/^ {10}title:\s*"([^"]*)"/);
        if (titleMatch) {
          currentMeta.title = titleMatch[1];
          const modeData = result.get(currentMode);
          if (modeData) {
            modeData.meta = { ...currentMeta };
          }
          continue;
        }

        // Parse description
        const descMatch = line.match(/^ {10}description:\s*"([^"]*)"/);
        if (descMatch) {
          currentMeta.description = descMatch[1];
          const modeData = result.get(currentMode);
          if (modeData) {
            modeData.meta = { ...currentMeta };
          }
          continue;
        }

        // Parse tags
        const tagsMatch = line.match(/^ {10}tags:\s*\[([^\]]*)\]/);
        if (tagsMatch) {
          const tagsStr = tagsMatch[1];
          currentMeta.tags = tagsStr
            .split(",")
            .map(t => t.trim())
            .filter(t => t.length > 0);
          const modeData = result.get(currentMode);
          if (modeData) {
            modeData.meta = { ...currentMeta };
          }
          continue;
        }
      }

      // Detect runs section
      if (line.match(/^ {10}runs:\s*$/) && currentMode) {
        inRuns = true;
        continue;
      }

      // Parse provider runs (12 spaces indent)
      if (inRuns && currentMode) {
        const runsMatch = line.match(/^ {12}([a-z0-9._-]+):\s*"([^"]*)"/);
        if (runsMatch) {
          const providerId = runsMatch[1];
          const runsValue = runsMatch[2];
          const modeData = result.get(currentMode);
          if (modeData) {
            modeData.providerOrder.push(providerId);
            modeData.runs.set(providerId, runsValue);
          }
        } else if (!line.startsWith("            ") && line.trim()) {
          // End of runs section
          inRuns = false;
        }
      }
    }

    return result;
  }

  /**
   * Generates fresh YAML content from provider modes (no existing file).
   * Used when creating a new file from scratch.
   */
  private generateFreshFromProviderModes(allModes: Map<string, Map<string, string>>): string {
    const lines = this.buildYamlHeader();

    // Process canonical modes first (in order)
    const processedModes = new Set<string>();
    for (const modeId of Object.keys(CANONICAL_MODES)) {
      const providers = allModes.get(modeId);
      if (providers && providers.size > 0) {
        // For new files, sort providers alphabetically for consistent initial output
        const sortedProviderIds = [...providers.keys()].sort();
        this.appendMode(lines, modeId, CANONICAL_MODES[modeId], providers, sortedProviderIds);
        processedModes.add(modeId);
      }
    }

    // Process any non-canonical modes
    for (const [modeId, providers] of allModes) {
      if (!processedModes.has(modeId) && providers.size > 0) {
        const sortedProviderIds = [...providers.keys()].sort();
        this.appendMode(lines, modeId, { title: modeId }, providers, sortedProviderIds);
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Generates YAML content from parsed modes data (with preserved metadata and order).
   * Used when updating an existing file.
   */
  private generateFreshFromParsedModes(allModes: Map<string, ParsedModeData>): string {
    const lines = this.buildYamlHeader();

    // Process canonical modes first (in order)
    const processedModes = new Set<string>();
    for (const modeId of Object.keys(CANONICAL_MODES)) {
      const modeData = allModes.get(modeId);
      if (modeData && modeData.runs.size > 0) {
        // Use canonical metadata for canonical modes
        this.appendMode(lines, modeId, CANONICAL_MODES[modeId], modeData.runs, modeData.providerOrder);
        processedModes.add(modeId);
      }
    }

    // Process any non-canonical modes (preserve their metadata)
    for (const [modeId, modeData] of allModes) {
      if (!processedModes.has(modeId) && modeData.runs.size > 0) {
        // Use parsed metadata for custom modes
        this.appendMode(lines, modeId, modeData.meta, modeData.runs, modeData.providerOrder);
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Builds common YAML header lines.
   */
  private buildYamlHeader(): string[] {
    return [
      "# Auto-generated by Listing Generator IDE plugins",
      "# This file defines AI provider integration modes.",
      "# Manual edits to unknown providers/modes will be preserved.",
      "",
      "ai-interaction:",
      "  mode-sets:",
      "    ai-interaction:",
      '      title: "AI Interaction"',
      "      modes:"
    ];
  }

  /**
   * Appends a mode block to lines array.
   *
   * @param lines - Output lines array
   * @param modeId - Mode identifier
   * @param meta - Mode metadata (title, description, tags)
   * @param providers - Map of providerId to runs string
   * @param providerOrder - Order of providers to output (preserves existing order)
   */
  private appendMode(
    lines: string[],
    modeId: string,
    meta: ModeMeta,
    providers: Map<string, string>,
    providerOrder: string[]
  ): void {
    lines.push(`        ${modeId}:`);
    lines.push(`          title: "${meta.title}"`);

    if (meta.description) {
      lines.push(`          description: "${meta.description}"`);
    }

    if (meta.tags && meta.tags.length > 0) {
      lines.push(`          tags: [${meta.tags.join(", ")}]`);
    }

    lines.push("          runs:");

    // Output providers in the specified order
    for (const providerId of providerOrder) {
      const runs = providers.get(providerId);
      if (runs !== undefined) {
        lines.push(`            ${providerId}: "${runs}"`);
      }
    }
  }
}
