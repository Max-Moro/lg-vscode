/**
 * Build script for LG UI Components
 * Combines all component CSS and JS files into dist bundles
 * 
 * Run: npx ts-node src/build-ui.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Use process.cwd() for the build script root
const SCRIPT_DIR = path.dirname(__filename);
const MEDIA_DIR = path.join(SCRIPT_DIR, '../media');
const UI_DIR = path.join(MEDIA_DIR, 'ui');
const DIST_DIR = path.join(UI_DIR, 'dist');

// Component discovery order (explicit for predictable loading)
const COMPONENTS = [
  'button',
  'select',
  'input',
  'number',
  'autosuggest',
  'textarea',
  'chat-input'
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function buildCSS() {
  console.log('📦 Building CSS bundle...');
  
  const parts: string[] = [];
  
  // 1. Core tokens
  const tokens = readFileIfExists(path.join(UI_DIR, 'core/tokens.css'));
  if (tokens) {
    parts.push('/* ========== CORE: TOKENS ========== */');
    parts.push(tokens);
  }
  
  // 2. Core reset
  const reset = readFileIfExists(path.join(UI_DIR, 'core/reset.css'));
  if (reset) {
    parts.push('/* ========== CORE: RESET ========== */');
    parts.push(reset);
  }
  
  // 3. Components (in order)
  COMPONENTS.forEach(comp => {
    const cssPath = path.join(UI_DIR, `components/${comp}/${comp}.css`);
    const css = readFileIfExists(cssPath);
    if (css) {
      parts.push(`/* ========== COMPONENT: ${comp.toUpperCase()} ========== */`);
      parts.push(css);
      console.log(`  ✓ ${comp}.css`);
    }
  });
  
  const bundle = parts.join('\n\n');
  const outPath = path.join(DIST_DIR, 'lg-ui.css');
  fs.writeFileSync(outPath, bundle, 'utf-8');
  
  console.log(`✅ CSS bundle created: ${outPath} (${(bundle.length / 1024).toFixed(1)} KB)`);
}

function buildJS() {
  console.log('📦 Building JS bundle...');
  
  const parts: string[] = [];
  
  // Header
  parts.push('/**');
  parts.push(' * LG UI Components Library');
  parts.push(' * Auto-generated bundle');
  parts.push(' */');
  parts.push('');
  parts.push('(function(global) {');
  parts.push('  "use strict";');
  parts.push('');
  
  // Utils (inline, without imports)
  ['dom', 'events', 'state'].forEach(util => {
    const jsPath = path.join(UI_DIR, `utils/${util}.js`);
    let js = readFileIfExists(jsPath);
    if (js) {
      // Remove export statements
      js = js.replace(/export\s+(const|function|class)\s+/g, '$1 ');
      parts.push(`  /* ========== UTIL: ${util.toUpperCase()} ========== */`);
      parts.push(indent(js, 2));
      console.log(`  ✓ ${util}.js`);
    }
  });
  
  parts.push('');
  
  // Components (inline, without imports)
  const components: Record<string, string> = {};
  
  COMPONENTS.forEach(comp => {
    const jsPath = path.join(UI_DIR, `components/${comp}/${comp}.js`);
    let js = readFileIfExists(jsPath);
    if (js) {
      // Remove import statements
      js = js.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
      // Remove export statements
      js = js.replace(/export\s+(const|function|class)\s+/g, '$1 ');
      js = js.replace(/export\s+{[^}]*};?\s*/g, '');
      
      parts.push(`  /* ========== COMPONENT: ${comp.toUpperCase()} ========== */`);
      parts.push(indent(js, 2));
      console.log(`  ✓ ${comp}.js`);
      
      // Collect exported names
      components[comp] = comp;
    }
  });
  
  parts.push('');
  
  // Global namespace
  parts.push('  /* ========== GLOBAL API ========== */');
  parts.push('  global.LGUI = {');
  parts.push('    // Utils');
  parts.push('    DOM,');
  parts.push('    Events,');
  parts.push('    State,');
  parts.push('    // Components');
  parts.push('    Button,');
  parts.push('    enhanceButton,');
  parts.push('    Autosuggest,');
  parts.push('    createAutosuggest,');
  parts.push('    ChatInput,');
  parts.push('    createChatInput,');
  parts.push('    fillSelect,');
  parts.push('    enhanceSelect,');
  parts.push('    enhanceInput,');
  parts.push('    enhanceNumber,');
  parts.push('    enhanceTextarea,');
  parts.push('    // Version');
  parts.push('    version: "1.0.0"');
  parts.push('  };');
  parts.push('');
  parts.push('})(window);');
  
  const bundle = parts.join('\n');
  const outPath = path.join(DIST_DIR, 'lg-ui.js');
  fs.writeFileSync(outPath, bundle, 'utf-8');
  
  console.log(`✅ JS bundle created: ${outPath} (${(bundle.length / 1024).toFixed(1)} KB)`);
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(line => prefix + line).join('\n');
}

function main() {
  console.log('🚀 Building LG UI Components...\n');
  
  ensureDir(DIST_DIR);
  
  try {
    buildCSS();
    console.log('');
    buildJS();
    console.log('');
    console.log('✨ Build complete!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

main();
