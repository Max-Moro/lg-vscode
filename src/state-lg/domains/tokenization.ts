/**
 * Tokenization Domain - tokenizer settings
 */

import { command } from "../../state-engine";
import { rule } from "../rule";
import type { PCEState } from "../types";
import { cliListEncoders } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export const SelectLib = command("tokenization/SELECT_LIB").payload<{ lib: string }>();
export const SetEncoder = command("tokenization/SET_ENCODER").payload<{ encoder: string }>();
export const SetCtxLimit = command("tokenization/SET_CTX_LIMIT").payload<{ limit: number }>();
export const LibsLoaded = command("tokenization/LIBS_LOADED").payload<{ libs: string[] }>();
export const EncodersLoaded = command("tokenization/ENCODERS_LOADED").payload<{ encoders: string[] }>();

// ============================================
// Tokenization Defaults
// ============================================

/** Default tokenizer library */
export const DEFAULT_TOKENIZER_LIB = "tiktoken";

/** Default encoder (for tiktoken) */
export const DEFAULT_ENCODER = "o200k_base";

/**
 * Preferred encoder for each tokenizer library.
 * Modern encoders optimized for code and multilingual content.
 *
 * - tiktoken: o200k_base — OpenAI tokenizer for GPT-4o, o1, o3, GPT-5
 * - tokenizers: mistralai/Mistral-7B-v0.1 — Tekken-based, 30% more efficient for code
 * - sentencepiece: google/mt5-base — excellent multilingual support
 */
const PREFERRED_ENCODER: Record<string, string> = {
  tiktoken: "o200k_base",
  tokenizers: "mistralai/Mistral-7B-v0.1",
  sentencepiece: "google/mt5-base"
};

/**
 * Get preferred encoder for library, fallback to first available.
 */
function selectBestEncoder(lib: string, availableEncoders: string[]): string {
  const preferred = PREFERRED_ENCODER[lib];
  if (preferred && availableEncoders.includes(preferred)) {
    return preferred;
  }
  return availableEncoders[0] || "";
}

// ============================================
// Rules
// ============================================

/** When tokenizer libs are loaded, store them and validate selection */
rule(LibsLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { libs } = cmd;
    const currentLib = state.persistent.tokenizerLib;

    const isValid = currentLib && libs.includes(currentLib);
    const newLib = isValid ? currentLib : (libs[0] || "tiktoken");

    const result = {
      configMutations: { tokenizerLibs: libs }
    };

    if (!isValid || state.configuration.encoders.length === 0) {
      return {
        ...result,
        mutations: { tokenizerLib: newLib },
        asyncOps: [{
          execute: async () => {
            const encoders = await cliListEncoders(newLib);
            return { type: "tokenization/ENCODERS_LOADED", encoders };
          }
        }]
      };
    }

    return result;
  }
});

/** When tokenizer lib changes, reload encoders list */
rule(SelectLib, {
  condition: (state: PCEState, cmd) =>
    cmd.lib !== state.persistent.tokenizerLib,
  apply: (_state: PCEState, cmd) => {
    const { lib } = cmd;
    return {
      mutations: { tokenizerLib: lib },
      asyncOps: [{
        execute: async () => {
          const encoders = await cliListEncoders(lib);
          return { type: "tokenization/ENCODERS_LOADED", encoders };
        }
      }]
    };
  }
});

/** When encoders are loaded, store them and validate current selection */
rule(EncodersLoaded, {
  condition: () => true,
  apply: (state: PCEState, cmd) => {
    const { encoders } = cmd;
    const currentEncoder = state.persistent.encoder;
    const currentLib = state.persistent.tokenizerLib;

    const configMutations = { encoders };

    // Check if current encoder exists in new list
    const isValid = currentEncoder && encoders.includes(currentEncoder);

    if (isValid) {
      return { configMutations };
    }

    // Select best encoder for current library
    const newEncoder = selectBestEncoder(currentLib, encoders);
    return {
      configMutations,
      followUp: newEncoder ? [SetEncoder.create({ encoder: newEncoder })] : []
    };
  }
});

/** When encoder is set, update persistent state */
rule(SetEncoder, {
  condition: (state: PCEState, cmd) =>
    cmd.encoder !== state.persistent.encoder,
  apply: (_state: PCEState, cmd) => ({
    mutations: { encoder: cmd.encoder }
  })
});

/** When context limit is set, update persistent state */
rule(SetCtxLimit, {
  condition: () => true,
  apply: (_state: PCEState, cmd) => {
    let limit = cmd.limit;
    if (isNaN(limit) || limit < 1000) {
      limit = 1000;
    } else if (limit > 2000000) {
      limit = 2000000;
    }
    return { mutations: { ctxLimit: limit } };
  }
});
