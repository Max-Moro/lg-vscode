/**
 * Tokenization Domain - tokenizer settings
 */

import { command, rule, type PCEState } from "../types";
import { cliListEncoders, type EncoderEntry } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export const SelectLib = command("tokenization/SELECT_LIB").payload<{ lib: string }>();
export const SetEncoder = command("tokenization/SET_ENCODER").payload<{ encoder: string }>();
export const SetCtxLimit = command("tokenization/SET_CTX_LIMIT").payload<{ limit: number }>();
export const LibsLoaded = command("tokenization/LIBS_LOADED").payload<{ libs: string[] }>();
export const EncodersLoaded = command("tokenization/ENCODERS_LOADED").payload<{ encoders: EncoderEntry[] }>();

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
          id: "load-encoders-initial",
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
        id: "load-encoders",
        execute: async () => {
          const encoders = await cliListEncoders(lib);
          return { type: "tokenization/ENCODERS_LOADED", encoders };
        }
      }]
    };
  }
});

/** When encoders are loaded, store them */
rule(EncodersLoaded, {
  condition: () => true,
  apply: (_state: PCEState, cmd) => ({
    configMutations: { encoders: cmd.encoders }
  })
});

/** When encoder is set, update persistent state */
rule(SetEncoder, {
  condition: () => true,
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
