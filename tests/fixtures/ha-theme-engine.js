// Shared Home Assistant theme engine for the card harnesses (tools card and
// remote card). Pure functions over the fixture in ha-themes.js; the
// harnesses own the DOM side (which element the variables land on, the
// switcher UI, the `hass.themes` object handed to the card).
//
// Faithful to home-assistant/frontend:
//   * applyThemesOnElement + processTheme (src/common/dom/apply_themes_on_element.ts):
//     dark base vars only in dark mode, theme vars on top, then the mode
//     block; hex values get an --rgb-<key> companion unless the theme
//     defines one.
//   * themes-mixin (src/state/themes-mixin.ts): a theme declaring a single
//     mode is forced to that mode; a flat theme (no `modes`) runs with
//     darkMode=false.
//
// Theme value grammar used by both harnesses:
//   "light" | "dark"          HA default palette in that mode
//   "<name>"                  flat or single-mode theme (HA forces its mode)
//   "<name>|light" / "|dark"  theme declaring both modes
(function () {
  function themeModes(theme) {
    return theme?.modes ? ["light", "dark"].filter((mode) => mode in theme.modes) : [];
  }

  /** HA's forced mode for a theme: null = follows the user's dark toggle. */
  function forcedDark(theme) {
    const modes = themeModes(theme);
    if (modes.length === 2) return null;
    return modes.includes("dark");
  }

  function optionList(fixture) {
    const options = [
      { value: "light", label: "Light", group: "Home Assistant default" },
      { value: "dark", label: "Dark", group: "Home Assistant default" },
    ];
    for (const [name, theme] of Object.entries(fixture?.themes ?? {})) {
      if (themeModes(theme).length === 2) {
        options.push({ value: `${name}|light`, label: `${name} · light`, group: "Community themes" });
        options.push({ value: `${name}|dark`, label: `${name} · dark`, group: "Community themes" });
      } else {
        options.push({ value: name, label: name, group: "Community themes" });
      }
    }
    return options;
  }

  /** Returns { value, name, dark } or null for an unknown theme. */
  function parseValue(fixture, raw) {
    const value = String(raw ?? "light");
    if (value === "light" || value === "dark") return { value, name: null, dark: value === "dark" };
    const pipe = value.lastIndexOf("|");
    const name = pipe === -1 ? value : value.slice(0, pipe);
    const suffix = pipe === -1 ? "" : value.slice(pipe + 1);
    const theme = fixture?.themes?.[name];
    if (!theme) return null;
    const forced = forcedDark(theme);
    if (forced === null) return { value: `${name}|${suffix === "dark" ? "dark" : "light"}`, name, dark: suffix === "dark" };
    return { value: name, name, dark: forced };
  }

  function hexToRgbTriplet(value) {
    const hex = String(value).trim().slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(",");
  }

  /** Inline style map ("--key" -> value) HA would set on the element. */
  function buildRules(fixture, { name, dark }) {
    let rules = {};
    if (dark) rules = { ...(fixture?.base?.dark ?? {}) };
    const theme = name ? fixture?.themes?.[name] : null;
    if (theme) {
      rules = { ...rules, ...theme.vars };
      const modeBlock = theme.modes?.[dark ? "dark" : "light"];
      if (modeBlock) rules = { ...rules, ...modeBlock };
    }
    const styles = {};
    for (const [key, rawValue] of Object.entries(rules)) {
      const value = String(rawValue);
      styles[`--${key}`] = value;
      if (!value.startsWith("#") || rules[`rgb-${key}`] !== undefined) continue;
      const triplet = hexToRgbTriplet(value);
      if (triplet) styles[`--rgb-${key}`] = triplet;
    }
    return styles;
  }

  /** The theme as HA's `hass.themes.themes[name]` would carry it. */
  function rawTheme(fixture, name) {
    const theme = fixture?.themes?.[name];
    if (!theme) return null;
    return { ...theme.vars, ...(theme.modes ? { modes: theme.modes } : {}) };
  }

  /** CSS text declaring HA's base light palette on :root. */
  function baseLightCss(fixture) {
    const declarations = Object.entries(fixture?.base?.light ?? {})
      .map(([key, value]) => `  --${key}: ${value};`)
      .join("\n");
    return `:root {\n${declarations}\n}`;
  }

  // Computed colours come back as rgb()/rgba(), or color(srgb r g b / a)
  // when they resulted from color-mix(in srgb, …).
  function parseCssColor(value) {
    const text = String(value ?? "").trim();
    let m = text.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    }
    m = text.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s\/]+/).filter(Boolean).map(Number);
      if (parts.length >= 3) return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts[3] ?? 1 };
    }
    if (text.startsWith("#")) {
      const triplet = hexToRgbTriplet(text.slice(0, 7));
      if (triplet) {
        const [r, g, b] = triplet.split(",").map(Number);
        const a = text.length === 9 ? parseInt(text.slice(7, 9), 16) / 255 : 1;
        return { r, g, b, a };
      }
    }
    return null;
  }

  /** "dark" when the resolved --primary-text-color is light, else "light". */
  function detectAppearance(scopeElement) {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;color:var(--primary-text-color)";
    (scopeElement ?? document.body).appendChild(probe);
    const color = parseCssColor(getComputedStyle(probe).color);
    probe.remove();
    if (!color) return "light";
    const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
    return luminance > 0.5 ? "dark" : "light";
  }

  window.HAThemeEngine = {
    themeModes, forcedDark, optionList, parseValue, buildRules, rawTheme,
    baseLightCss, hexToRgbTriplet, parseCssColor, detectAppearance,
  };
})();
