/**
 * Flider Design-System Utility
 * Framework-neutral helpers for applying tokens/vibes as CSS variables.
 *
 * Usage:
 *   import tokens from "./design-tokens.json" assert { type: "json" };
 *   import { applyCoreTokens, applyVibe, getDefaultVibe } from "./theme.js";
 *
 *   applyCoreTokens(tokens);
 *   applyVibe(getDefaultVibe(tokens, "minimalist"));
 */

const DEFAULT_ROOT =
  typeof document !== "undefined" ? document.documentElement : null;

const setVar = (root, name, value) => {
  if (!root || value === undefined || value === null) return;
  root.style.setProperty(name, String(value));
};

export function applyCoreTokens(tokens, root = DEFAULT_ROOT) {
  if (!tokens || !root) return;

  const core = tokens.core || {};
  const color = core.color || {};
  const font = core.font || {};
  const motion = core.motion || {};

  setVar(root, "--fs-bg-color", color.bg);
  setVar(root, "--fs-surface-color", color.surface);
  setVar(root, "--fs-surface-color-light", color.surfaceLight);
  setVar(root, "--fs-text-primary", color.textPrimary);
  setVar(root, "--fs-text-secondary", color.textSecondary);
  setVar(root, "--fs-accent-color", color.accent);
  setVar(root, "--fs-accent-hover", color.accentHover);
  setVar(root, "--fs-border-color", color.border);
  setVar(root, "--fs-border-hover", color.borderHover);

  setVar(root, "--fs-font-sans", font.sans);
  setVar(root, "--fs-font-serif", font.serif);
  setVar(root, "--fs-font-mono", font.mono);

  setVar(root, "--fs-transition-fast", motion.fast);
  setVar(root, "--fs-transition-smooth", motion.smooth);
}

export function applyVibe(vibe, root = DEFAULT_ROOT) {
  if (!vibe || !root) return;

  setVar(root, "--fs-vibe-bg", vibe.bg);
  setVar(root, "--fs-vibe-text", vibe.text);
  setVar(root, "--fs-vibe-accent", vibe.accent);
  setVar(root, "--fs-vibe-heading-font", vibe.headingFont);
  setVar(root, "--fs-vibe-body-font", vibe.bodyFont);
}

export function getVibesForStyle(tokens, styleKey) {
  return tokens?.vibes?.[styleKey] || [];
}

export function getDefaultVibe(tokens, styleKey) {
  return getVibesForStyle(tokens, styleKey)[0] || null;
}

export function getVibeById(tokens, styleKey, vibeId) {
  const vibes = getVibesForStyle(tokens, styleKey);
  return vibes.find((v) => v.id === vibeId) || getDefaultVibe(tokens, styleKey);
}

export function listStyleKeys(tokens) {
  return Object.keys(tokens?.styles || {});
}

export function applyTheme(tokens, { styleKey, vibeId } = {}, root = DEFAULT_ROOT) {
  if (!tokens || !root) return null;
  applyCoreTokens(tokens, root);
  const vibe = getVibeById(tokens, styleKey, vibeId);
  if (vibe) applyVibe(vibe, root);
  return vibe;
}

