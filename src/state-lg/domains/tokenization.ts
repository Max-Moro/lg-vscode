/**
 * Tokenization Domain - tokenizer settings
 */

import { command } from "../../state-engine";
import { rule } from "../rule";
import type { PCEState } from "../types";
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

    const configMutations = { encoders };

    // Check if current encoder exists in new list
    const encoderNames = encoders.map(e => e.name);
    const isValid = currentEncoder && encoderNames.includes(currentEncoder);

    if (isValid) {
      return { configMutations };
    }

    // Delegate to SetEncoder if current is invalid
    const newEncoder = encoderNames[0] || "";
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
