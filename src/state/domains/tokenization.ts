/**
 * Tokenization Domain - tokenizer settings
 *
 * Commands:
 * - tokenization/SELECT_LIB - select tokenizer library
 * - tokenization/SET_ENCODER - set encoder name
 * - tokenization/SET_CTX_LIMIT - set context limit
 * - tokenization/LIBS_LOADED - tokenizer libraries loaded
 * - tokenization/ENCODERS_LOADED - encoders loaded
 */

import type { BusinessRule, DomainModule, BaseCommand, PCEState } from "../types";
import { cliListEncoders, type EncoderEntry } from "../../cli/CliClient";

// ============================================
// Commands
// ============================================

export interface SelectLibCmd extends BaseCommand {
  type: "tokenization/SELECT_LIB";
  lib: string;
}

export interface SetEncoderCmd extends BaseCommand {
  type: "tokenization/SET_ENCODER";
  encoder: string;
}

export interface SetCtxLimitCmd extends BaseCommand {
  type: "tokenization/SET_CTX_LIMIT";
  limit: number;
}

export interface LibsLoadedCmd extends BaseCommand {
  type: "tokenization/LIBS_LOADED";
  libs: string[];
}

export interface EncodersLoadedCmd extends BaseCommand {
  type: "tokenization/ENCODERS_LOADED";
  encoders: EncoderEntry[];
}

export type TokenizationCommand =
  | SelectLibCmd
  | SetEncoderCmd
  | SetCtxLimitCmd
  | LibsLoadedCmd
  | EncodersLoadedCmd;

// ============================================
// Rules
// ============================================

const libsLoaded: BusinessRule = {
  id: "tokenization/libs-loaded",
  description: "When tokenizer libs are loaded, store them and validate selection",
  trigger: "tokenization/LIBS_LOADED",
  condition: () => true,
  apply: (state: PCEState, cmd: BaseCommand) => {
    const { libs } = cmd as LibsLoadedCmd;
    const currentLib = state.persistent.tokenizerLib;

    const isValid = currentLib && libs.includes(currentLib);
    const newLib = isValid ? currentLib : (libs[0] || "tiktoken");

    const result: ReturnType<BusinessRule["apply"]> = {
      configMutations: { tokenizerLibs: libs }
    };

    if (!isValid || state.configuration.encoders.length === 0) {
      result.mutations = { tokenizerLib: newLib };
      result.asyncOps = [{
        id: "load-encoders-initial",
        execute: async () => {
          const encoders = await cliListEncoders(newLib);
          return { type: "tokenization/ENCODERS_LOADED", encoders };
        }
      }];
    }

    return result;
  }
};

const libSelect: BusinessRule = {
  id: "tokenization/select-lib",
  description: "When tokenizer lib changes, reload encoders list",
  trigger: "tokenization/SELECT_LIB",
  condition: (state: PCEState, cmd: BaseCommand) =>
    (cmd as SelectLibCmd).lib !== state.persistent.tokenizerLib,
  apply: (_state: PCEState, cmd: BaseCommand) => {
    const { lib } = cmd as SelectLibCmd;
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
};

const encodersLoaded: BusinessRule = {
  id: "tokenization/encoders-loaded",
  description: "When encoders are loaded, store them",
  trigger: "tokenization/ENCODERS_LOADED",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    configMutations: { encoders: (cmd as EncodersLoadedCmd).encoders }
  })
};

const encoderSet: BusinessRule = {
  id: "tokenization/set-encoder",
  description: "When encoder is set, update persistent state",
  trigger: "tokenization/SET_ENCODER",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => ({
    mutations: { encoder: (cmd as SetEncoderCmd).encoder }
  })
};

const ctxLimitSet: BusinessRule = {
  id: "tokenization/set-ctx-limit",
  description: "When context limit is set, update persistent state",
  trigger: "tokenization/SET_CTX_LIMIT",
  condition: () => true,
  apply: (_state: PCEState, cmd: BaseCommand) => {
    let limit = (cmd as SetCtxLimitCmd).limit;
    if (isNaN(limit) || limit < 1000) {
      limit = 1000;
    } else if (limit > 2000000) {
      limit = 2000000;
    }
    return { mutations: { ctxLimit: limit } };
  }
};

// ============================================
// Domain Module Export
// ============================================

export const tokenizationDomain: DomainModule = {
  id: "tokenization",
  rules: [libsLoaded, libSelect, encodersLoaded, encoderSet, ctxLimitSet]
};
