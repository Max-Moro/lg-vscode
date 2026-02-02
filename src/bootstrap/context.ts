/**
 * Extension Context storage and utilities.
 * Provides centralized access to VS Code extension context.
 */
import * as vscode from "vscode";

let _context: vscode.ExtensionContext | undefined;

/**
 * Set extension context. Called once during bootstrap.
 * @throws Error if context already set
 */
export function setContext(ctx: vscode.ExtensionContext): void {
  if (_context) {
    throw new Error("Extension context already set");
  }
  _context = ctx;
}

/**
 * Get extension context.
 * @throws Error if not bootstrapped
 */
export function getContext(): vscode.ExtensionContext {
  if (!_context) {
    throw new Error("Extension not bootstrapped - call bootstrap() first");
  }
  return _context;
}

/**
 * Clear extension context. Called during shutdown.
 */
export function clearContext(): void {
  _context = undefined;
}

