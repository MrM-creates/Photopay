# Flider UI Kit Export

This folder contains a reusable style pack extracted from Flider:

- `design-tokens.json`: design tokens + 4x4 vibe presets
- `base-components.css`: base UI classes (panel, buttons, inputs, cards, motion)
- `theme.js`: helper functions (apply core tokens + vibe + full theme)

## 1) Quick Start

1. Copy both files into your new app.
2. Load `base-components.css`.
3. Map tokens from `design-tokens.json` to CSS vars.

Example (runtime):

```js
import tokens from "./design-tokens.json";

const root = document.documentElement;
root.style.setProperty("--fs-bg-color", tokens.core.color.bg);
root.style.setProperty("--fs-surface-color", tokens.core.color.surface);
root.style.setProperty("--fs-text-primary", tokens.core.color.textPrimary);
```

Recommended (utility):

```js
import tokens from "./design-tokens.json";
import { applyTheme } from "./theme.js";

applyTheme(tokens, { styleKey: "minimalist", vibeId: "M-01" });
```

## 2) Apply a Vibe

```js
function applyVibe(vibe) {
  const root = document.documentElement;
  root.style.setProperty("--fs-vibe-bg", vibe.bg);
  root.style.setProperty("--fs-vibe-text", vibe.text);
  root.style.setProperty("--fs-vibe-accent", vibe.accent);
  root.style.setProperty("--fs-vibe-heading-font", vibe.headingFont);
  root.style.setProperty("--fs-vibe-body-font", vibe.bodyFont);
}

// Example:
// applyVibe(tokens.vibes.minimalist[0]);
```

## 3) Core Classes

- Layout shell: `fs-app`
- Surface panel: `fs-glass-panel`
- Buttons: `fs-btn fs-btn-primary` or `fs-btn fs-btn-outline`
- Input: `fs-input`
- Card: `fs-card`
- Motion: `fs-fade-in`
- Vibe bridge: `fs-vibe-surface`, `fs-vibe-heading`, `fs-vibe-body`, `fs-vibe-accent`

## 4) Font Recommendation

If you want visual parity with Flider, include:

- Space Mono
- Playfair Display
- Inter + Inter Tight
- Source Sans 3
- Plus Jakarta Sans
- Roboto
- Libre Baskerville
- Lora

Use local hosting for production if you want strict performance/privacy control.
