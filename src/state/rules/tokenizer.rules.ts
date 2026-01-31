/**
 * Business rules for tokenization settings
 */

import type { TypedRule } from "../types";
import { listEncodersJson } from "../../services/CatalogService";

/**
 * Rule: When tokenizer lib changes, reload encoders list
 */
export const tokenizerLibEncoders: TypedRule<"SELECT_TOKENIZER_LIB"> = {
  id: "tokenizer-lib-encoders",
  description: "When tokenizer lib changes, reload encoders list",
  trigger: "SELECT_TOKENIZER_LIB",
  condition: (state, cmd) => cmd.lib !== state.persistent.tokenizerLib,
  apply: (_state, cmd) => ({
    mutations: { tokenizerLib: cmd.lib },
    asyncOps: [{
      id: "load-encoders",
      execute: async () => {
        const encoders = await listEncodersJson(cmd.lib);
        return { type: "ENCODERS_LOADED", encoders };
      }
    }]
  })
};

/**
 * Rule: When tokenizer libs are loaded, store them
 */
export const tokenizerLibsLoaded: TypedRule<"TOKENIZER_LIBS_LOADED"> = {
  id: "tokenizer-libs-loaded",
  description: "When tokenizer libs are loaded, store them and validate selection",
  trigger: "TOKENIZER_LIBS_LOADED",
  condition: () => true,
  apply: (state, cmd) => {
    const libs = cmd.libs;
    const currentLib = state.persistent.tokenizerLib;

    // Validate current selection
    const isValid = currentLib && libs.includes(currentLib);
    const newLib = isValid ? currentLib : (libs[0] || "tiktoken");

    const result: ReturnType<TypedRule<"TOKENIZER_LIBS_LOADED">["apply"]> = {
      configMutations: { tokenizerLibs: libs }
    };

    // If lib changed or need to load initial encoders
    if (!isValid || state.configuration.encoders.length === 0) {
      result.mutations = { tokenizerLib: newLib };
      result.asyncOps = [{
        id: "load-encoders-initial",
        execute: async () => {
          const encoders = await listEncodersJson(newLib);
          return { type: "ENCODERS_LOADED", encoders };
        }
      }];
    }

    return result;
  }
};

/**
 * Rule: When encoders are loaded, store them
 */
export const encodersLoaded: TypedRule<"ENCODERS_LOADED"> = {
  id: "encoders-loaded",
  description: "When encoders are loaded, store them",
  trigger: "ENCODERS_LOADED",
  condition: () => true,
  apply: (_state, cmd) => ({
    configMutations: { encoders: cmd.encoders }
  })
};

/**
 * Rule: When encoder is set, update persistent state
 */
export const encoderSet: TypedRule<"SET_ENCODER"> = {
  id: "encoder-set",
  description: "When encoder is set, update persistent state",
  trigger: "SET_ENCODER",
  condition: () => true,
  apply: (_state, cmd) => ({
    mutations: { encoder: cmd.encoder }
  })
};

/**
 * Rule: When context limit is set, update persistent state
 */
export const ctxLimitSet: TypedRule<"SET_CTX_LIMIT"> = {
  id: "ctx-limit-set",
  description: "When context limit is set, update persistent state",
  trigger: "SET_CTX_LIMIT",
  condition: () => true,
  apply: (_state, cmd) => {
    // Validate limit bounds
    let limit = cmd.limit;
    if (isNaN(limit) || limit < 1000) {
      limit = 1000;
    } else if (limit > 2000000) {
      limit = 2000000;
    }

    return {
      mutations: { ctxLimit: limit }
    };
  }
};

export const tokenizerRules = [
  tokenizerLibEncoders,
  tokenizerLibsLoaded,
  encodersLoaded,
  encoderSet,
  ctxLimitSet
];
