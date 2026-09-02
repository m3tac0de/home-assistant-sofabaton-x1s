// Stylesheets for the remote card and its config editor, extracted verbatim
// from the legacy monolith so the strings can be shared with the Lit port
// (wrap with unsafeCSS for static styles). Byte-identical to the previous
// inline template literals.

export const REMOTE_CARD_CSS = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        /* Hover / press overlays for keys and drawer buttons, derived from
           the theme's text colour (see sb-key-button.ts). Declared on
           .wrap below so a card-level theme applied on ha-card is seen. */

        display: block;
      }

      ha-card {
        width: 100%;
        max-width: var(--remote-max-width);
        transform: scale(var(--remote-zoom));
        transform-origin: top center;
        margin-left: auto;
        margin-right: auto;
        --sb-key-font-size: clamp(11px, 7cqw, 50px);
        --sb-tab-font-size: clamp(14px, 4cqw, 20px);
        --sb-tab-height: clamp(32px, 9cqw, 44px);
        --sb-color-key-min-height: clamp(12px, 3.2cqw, 20px);
        container-type: inline-size;
      }

      /* Theme-resilience tokens, one level below ha-card (where a card-level
         theme: config lands as inline variables) so both global and card-level
         themes feed them. --secondary-text-color is floored toward primary
         text: themes like Caule alias it to their disabled grey. */
      ha-card { --sb-theme-secondary-text: var(--secondary-text-color); }
      .wrap {
        --secondary-text-color: color-mix(in srgb, var(--sb-theme-secondary-text) 40%, var(--primary-text-color));
        /* Overlay/tint base: the text colour, unless a background override
           contradicts the page theme, in which case _applyLocalTheme sets
           --sb-overlay-base from the override's own luminance. */
        --sb-tint-base: var(--sb-overlay-base, var(--primary-text-color));
        --sb-overlay-hover: color-mix(in srgb, var(--sb-tint-base) 10%, transparent);
        --sb-overlay-press: color-mix(in srgb, var(--sb-tint-base) 18%, transparent);
        --sb-accent-text: color-mix(in srgb, var(--primary-color) 35%, var(--primary-text-color));
        /* Field surface for native inputs (the commands filter): the card
           surface with a 6% text tint, same recipe as the control panel.
           The theme's input fill is not trusted (Caule aliases it to the
           primary colour, glass themes set it transparent). */
        --sb-field-surface: color-mix(in srgb, var(--sb-tint-base) 6%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        /* Raised-surface pair used by key_style tinted/elevated. Computed
           here (not on the consumers) so redefining --ha-card-background on
           a drawer button from it is not a self-reference. */
        --sb-key-surface: color-mix(in srgb, var(--sb-tint-base) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        --sb-key-border: color-mix(in srgb, var(--sb-tint-base) 20%, transparent);
        /* Glossy: a vertical curve of the same tint (bright top, dark
           bottom) plus specular inset highlights. A gradient is legal here
           because every consumer puts the token in a background shorthand. */
        --sb-key-surface-glossy: linear-gradient(180deg,
          color-mix(in srgb, var(--sb-tint-base) 18%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 0%,
          color-mix(in srgb, var(--sb-tint-base) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 48%,
          color-mix(in srgb, var(--sb-tint-base) 2%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 100%);
        --sb-key-gloss-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.30),
          inset 0 6px 10px -6px rgba(255, 255, 255, 0.18),
          inset 0 -2px 4px rgba(0, 0, 0, 0.22),
          0 2px 6px rgba(0, 0, 0, 0.18);
        /* Panel surface used by key_style "panel": the control panel's dock
           recipe (card-styles.ts .card-topbar/.card-bottom-dock) — a subtle
           8%→4% accent gradient into the card background with a softened
           divider border — so both cards share one surface language. Subtle
           enough that the theme's text and icon colours read on it
           unchanged. A gradient is legal here because every consumer puts
           the token in a background shorthand. */
        --sb-panel-surface: linear-gradient(180deg,
          color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))),
          color-mix(in srgb, var(--primary-color) 4%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))));
        --sb-panel-border: color-mix(in srgb, var(--divider-color) 82%, transparent);
      }
      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      /* key_style: raise the keys off the card. The tint is mixed from the
         theme's TEXT colour, so it lands on the right side of any palette
         (8% white over a true-black card is a clearly raised #141414; 8%
         black over white a soft grey) and stays below the 10%/18% hover and
         press overlays, which stack on top of it. The floored border keeps
         a visible outline even where the theme's divider matches its
         background. Colour keys and the Macros/Favorites tabs declare their
         own --sb-control-* values closer to the element and are unaffected.
         "Elevated" adds a shadow, which only reads on light surfaces
         (nothing renders darker than a black card); the tint carries dark
         themes. */
      .wrap--keys-tinted,
      .wrap--keys-elevated {
        --sb-control-background: var(--sb-key-surface);
        --sb-control-border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy {
        --sb-control-background: var(--sb-key-surface-glossy);
        --sb-control-border-color: var(--sb-key-border);
        --sb-control-box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-elevated {
        --sb-control-box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      /* The drawer headers (Macros/Favorites bar and the device-mode
         Commands bar reuse .macroFavorites) and the buttons inside the
         drawers ride along with key_style: same raised surface and floored
         border as the keys. The drawer panel itself (.mf-overlay) stays on
         the card background so the buttons read as raised on it. The tab
         buttons inside the bar keep their transparent --sb-control-* (the
         BAR is the surface). Drawer buttons are ha-cards, so their tokens
         are redefined from the pair computed on .wrap. */
      .wrap--keys-tinted .macroFavorites,
      .wrap--keys-elevated .macroFavorites {
        background: var(--sb-key-surface);
        border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy .macroFavorites {
        background: var(--sb-key-surface-glossy);
        border-color: var(--sb-key-border);
        box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-tinted .drawer-btn,
      .wrap--keys-elevated .drawer-btn {
        --ha-card-background: var(--sb-key-surface);
        --ha-card-border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy .drawer-btn {
        --ha-card-background: var(--sb-key-surface-glossy);
        --ha-card-border-color: var(--sb-key-border);
        --ha-card-box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-elevated .macroFavorites {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      .wrap--keys-elevated .drawer-btn {
        --ha-card-box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      /* Tinted panels (the former key_style "panel", now an independent
         switch so it combines with any key style): the
         bordered group containers take the dock surface. With flat keys
         the keys KEEP the card background and read as card-coloured
         cutouts on a softly accent-tinted panel; with a tinted/elevated/
         glossy key style the keys keep that style's raised surface and
         the panels tint the ground behind them. The tint is subtle
         enough that no text or icon colour needs to change. Container-
         less keys (the nav .row3 and the device-mode power key) take
         the panel surface directly, but only under flat keys - a real
         key style owns their surface. These rules sit AFTER the
         key-style .macroFavorites rules so the bar counts as a
         container (panel surface) when both are on. */
      .wrap--panels .dpad,
      .wrap--panels .mid,
      .wrap--panels .media,
      .wrap--panels .colors,
      .wrap--panels .abc {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      .wrap--panels:not(.wrap--keys-tinted):not(.wrap--keys-elevated):not(.wrap--keys-glossy) .row3,
      .wrap--panels:not(.wrap--keys-tinted):not(.wrap--keys-elevated):not(.wrap--keys-glossy) .sb-power-key {
        --sb-control-background: var(--sb-panel-surface);
        --sb-control-border-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavorites {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavoritesButton + .macroFavoritesButton {
        border-left-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavoritesButton:first-child {
        border-right-color: var(--sb-panel-border);
      }
      .wrap--panels .mf-overlay {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      /* drawer-up re-declares border-top with the divider colour at higher
         specificity; keep it on the panel border. */
      .wrap--panels .mf-container.drawer-up .mf-overlay {
        border-top-color: var(--sb-panel-border);
      }
      .layout-container { display: grid; gap: 12px; }
      .layout-overlay {
        position: absolute;
        opacity: 1;
        transition: opacity 240ms ease;
        pointer-events: none;
        z-index: 2;
      }
      .layout-overlay--fade { opacity: 0; }
      @media (prefers-reduced-motion: reduce) {
        .layout-overlay { transition: none; }
      }
      ha-select { width: 100%; }

      /* HA 2026.04 introduced --ha-color-form-background (used by ha-combo-box-item
         inside ha-select). Community themes predate this variable so it falls back
         to the built-in light default (rgb(243,243,243)) even in dark themes.
         Override it here with theme-aware fallbacks so the field matches the theme. */
      .sb-activity-select {
        --ha-color-form-background: var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243)));
        /* Dropdown item text. HA declares these derived tokens on <html> as
           var(--primary-text-color), where they resolve once against the
           GLOBAL theme and descendants inherit the resolved color. A per-card
           theme / background override rewrites --primary-text-color on the
           card only, so the menu panel (which re-reads --card-background-color
           locally) follows the card while the item text stays the global
           theme's color: dark text on a dark panel. Re-declaring the tokens
           here makes them resolve against the card-local text color. No-op
           without a local override. Covers both dropdown generations:
           ha-dropdown-item (wa) and mwc-list-item (mdc). */
        --wa-color-text-normal: var(--primary-text-color);
        --wa-color-text-quiet: var(--secondary-text-color);
        --mdc-theme-text-primary-on-background: var(--primary-text-color);
        --mdc-theme-text-secondary-on-background: var(--secondary-text-color);
        /* Field label ("Activity" / "Device") and value. HA chains these to
           --input-label-ink-color / --input-ink-color on <html>, so a
           card-level theme never reaches them, and some themes (Caule) map
           the label to their disabled grey. Derive both from the card's
           own text colour instead. */
        --mdc-select-label-ink-color: color-mix(in srgb, var(--primary-text-color) 85%, transparent);
        --mdc-select-ink-color: var(--primary-text-color);
        --mdc-select-dropdown-icon-color: color-mix(in srgb, var(--primary-text-color) 70%, transparent);
        /* Menu item hover / selected fills. HA's ha-dropdown-item paints
           --ha-color-fill-neutral-quiet-hover (light grey under any flat
           theme, since flat themes run in light mode) behind item text that
           is now the card's text colour: under Caule both are ~#e5e5e5.
           Derive the fills from the card's own colours instead, as
           translucent tints over the menu panel. The selected item's text
           follows the accent-text rule (not pure primary colour). */
        --ha-color-fill-neutral-quiet-resting: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        --ha-color-fill-neutral-quiet-hover: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        --ha-color-fill-primary-quiet-resting: color-mix(in srgb, var(--primary-color) 14%, transparent);
        --ha-color-fill-primary-quiet-hover: color-mix(in srgb, var(--primary-color) 24%, transparent);
        /* wa-dropdown-item paints :host(:hover) and :focus-visible with
           --wa-color-neutral-fill-normal (HA: --ha-color-fill-neutral-normal-resting). */
        --ha-color-fill-neutral-normal-resting: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        --ha-color-fill-neutral-normal-hover: color-mix(in srgb, var(--primary-text-color) 18%, transparent);
        --wa-color-neutral-fill-normal: var(--ha-color-fill-neutral-normal-resting);
        --wa-color-neutral-fill-quiet: var(--ha-color-fill-neutral-quiet-hover);
        --wa-color-brand-fill-quiet: var(--ha-color-fill-primary-quiet-hover);
        --mdc-ripple-color: var(--primary-text-color);
        --sb-select-selected-text: var(--sb-accent-text, color-mix(in srgb, var(--primary-color) 35%, var(--primary-text-color)));
      }
      /* Outer-scope rule on the item host beats ha-dropdown-item's
         :host([selected]) { color: var(--primary-color) }. */
      .sb-activity-select ha-dropdown-item[selected],
      .sb-activity-select mwc-list-item[selected],
      .sb-activity-select mwc-list-item[activated] {
        color: var(--sb-select-selected-text);
      }

      .activityRow {
        display: grid;
        grid-template-columns: 1fr;
        position: relative;
        z-index: 3;
        /* One bottom line for the whole row. The select's field (HA's
           ha-picker-field) paints 1px --ha-color-border-neutral-loud at rest
           and 2px --mdc-theme-primary when focused; HA declares that chain on
           <html>, so under a card-level theme it resolved to the PAGE's
           primary (HA blue). Both tokens are re-declared below from these
           row tokens, and the mode toggle draws the same line so the two
           read as one control. */
        --sb-field-line: color-mix(in srgb, var(--primary-text-color) 42%, transparent);
        --sb-field-line-active: var(--primary-color);
      }
      .activityRow .sb-activity-select {
        --ha-color-border-neutral-loud: var(--sb-field-line);
        --mdc-theme-primary: var(--sb-field-line-active);
        --mdc-select-idle-line-color: var(--sb-field-line);
        --mdc-select-hover-line-color: var(--sb-field-line);
      }
      /* Long activity/device names ellipsize inside the select instead of
         pushing the card wider (grid items default to min-width auto). The
         same overflow clip also gives the field the theme's corner radius:
         rounding the HOST and zeroing the inner mdc shape token works for
         both ha-select generations (mdc and ha-picker-field) without
         knowing their internal shape tokens. The host paints the form
         background so any residual inner rounding never shows as notched
         corners. */
      .activityRow .sb-activity-select {
        min-width: 0;
        overflow: hidden;
        border-radius: var(--sb-group-radius);
        --mdc-shape-small: 0px;
        background: var(--ha-color-form-background);
      }

      /* Device mode: the toggle fuses to the select's left edge. */
      .activityRow--with-toggle {
        grid-template-columns: auto 1fr;
      }
      .sb-mode-toggle {
        width: 48px;
        align-self: stretch;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        cursor: pointer;
        color: var(--primary-text-color);
        background: var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243)));
        border: none;
        border-inline-end: 1px solid var(--divider-color);
        /* Same line as the field, drawn as an inset shadow so the 1px -> 2px
           active state never shifts layout. */
        box-shadow: inset 0 -1px 0 var(--sb-field-line);
        transition: box-shadow 180ms ease-in-out, background 120ms ease;
        /* One fused control with the select: the outer (inline-start) side
           follows the theme radius, the side meeting the select stays
           square. Logical corners keep the fused edge correct in RTL,
           where the toggle sits visually on the right. */
        border-start-start-radius: var(--sb-group-radius);
        border-end-start-radius: var(--sb-group-radius);
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .sb-mode-toggle:hover {
        background: color-mix(in srgb, var(--primary-text-color) 10%, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
      }
      .sb-mode-toggle:active {
        transform: scale(0.97);
        background: color-mix(in srgb, var(--primary-text-color) 18%, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
      }
      .sb-mode-toggle[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .sb-mode-toggle:focus-visible {
        outline: none;
      }
      /* The toggle's line follows the field: focused field (HA keeps the
         field focused after the menu closes, so does this), open menu, or
         keyboard focus on the toggle itself. */
      .activityRow--with-toggle:has(.sb-activity-select:focus-within) .sb-mode-toggle,
      .activityRow--with-toggle.activityRow--menu-open .sb-mode-toggle,
      .sb-mode-toggle:focus-visible {
        box-shadow: inset 0 -2px 0 var(--sb-field-line-active);
      }
      /* The select's corners on the fused edge go flat so toggle + select
         read as one control. */
      .activityRow--with-toggle .sb-activity-select {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
      }

      /* Device mode: Commands drawer (one command per row + filter input).
         Compound selector: the base .mf-grid two-column rule sits LATER in
         this sheet and would win at equal specificity. Responsive columns:
         one full-width command per row on narrow cards (~230px), two per
         row once the card has the width for it (~300px+). */
      .mf-grid.mf-grid--commands {
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      }
      .mf-grid--commands .drawer-btn .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sb-commands-filter {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 8px 12px;
        font: inherit;
        font-size: 13px;
        color: var(--primary-text-color);
        background: var(--sb-field-surface, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
        border: 1px solid var(--sb-key-border, var(--divider-color));
        border-radius: var(--sb-group-radius);
        outline: none;
      }
      .sb-commands-filter:focus {
        border-color: var(--primary-color, #03a9f4);
      }
      .sb-commands-filter::placeholder {
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
      /* The card sets an inline max-height from the measured viewport space
         (commandsOverlayMaxHeight); this only keeps the filter pinned. */
      .mf-overlay--commands .sb-commands-filter {
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .automationAssist {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: var(--sb-group-radius);
        border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      }

      .automationAssist__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .automationAssist__label {
        font-size: 13px;
        font-weight: 600;
      }

      .automationAssist__status {
        font-size: 12px;
        opacity: 0.75;
        min-height: 14px; /* reserves 1 line so height doesn't jump */
      }

      /* small pill button */
      .automationAssist__startBtn {
        border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__mqttBtn {
        border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        color: var(--primary-text-color);
        border-radius: 999px;
        margin:10px;
        padding: 10px 10px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__startBtn:hover {
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }

      .automationAssist__startBtn:active {
        transform: scale(0.98);
      }

      .automationAssist__startBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }

      .automationAssist__mqttBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }


 	  /* Loading feedback lives INSIDE the control's silhouette: an overlay
	     spanning the whole activity row (select alone, or the fused
	     toggle+select pair), rounded and clipped like the control, painting
	     only a bottom band. The band's ends follow the theme's curve, where
	     the old detached full-width bar stuck out past the rounded corners.
	     The row itself must never clip (the dropdown menu renders inside it
	     on the mdc generation), so the overlay clips itself instead. */
	  .loadIndicator {
	    visibility: hidden;
	    position: absolute;
	    inset: 0;
	    border-radius: var(--sb-group-radius);
	    overflow: hidden;
	    pointer-events: none;
	  }

	  .loadIndicator::before {
	    content: "";
	    position: absolute;
	    inset-inline: 0;
	    bottom: 0;
	    height: 4px;
	  }

	  .loadIndicator.is-loading {
	    visibility: visible;
	  }

	  .loadIndicator.is-loading::before {
	    background: var(--primary-color, #03a9f4);
	    background-image: linear-gradient(
  		  90deg,
		  transparent,
		  rgba(255, 255, 255, 0.4),
		  transparent
	    );
	    background-size: 200% 100%;
	    background-repeat: no-repeat;
	    animation: sb-shimmer 1.5s infinite linear;
	  }

	  @keyframes sb-shimmer {
	    0% {
		  background-position: -200% 0;
	    }
	    100% {
		  background-position: 200% 0;
	    }
	  }

			.remote { 
        position: relative;
        z-index: 0; /* Base layer */
        display: grid; 
        gap: 12px; 
      }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

			.macroFavoritesGrid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important; 
        width: 100% !important;
      }
			.macroFavoritesGrid.single {
        grid-template-columns: 1fr !important;
      }
			.macroFavoritesGrid.single .macroFavoritesButton + .macroFavoritesButton {
        border-left: none;
      }
			.macroFavoritesGrid.single .macroFavoritesButton:first-child {
        border-right: none;
      }
			.macroFavoritesButton {
        cursor: pointer;
        /* Tighter side padding than the default keys: at the 230px minimum
           card width each tab's text budget is ~81px minus the chevron
           reserve, and the longest tab labels (nl "Favorieten", en-GB
           "Favourites", ~65px at 14px Roboto) need the extra 4px to render
           without an ellipsis at the 14px font floor. */
        --sb-control-padding-inline: 8px;
        /* No padding: the inner control carries the hover/press overlay, so
           it must fill the whole cell or the highlight renders as an inset
           band instead of covering the full tab. */
        padding: 0;
        box-sizing: border-box;
        height: var(--sb-tab-height);
        display: block !important;
        position: relative;
        overflow: hidden;
        transition: background 0.2s ease;
        --sb-control-box-shadow: none;
        --sb-control-border-width: 0;
        --sb-control-border-color: transparent;
        --sb-control-background: transparent;
        --sb-control-radius: 0;
      }
      
      /* Active tab: text stays the theme's text colour, the accent tints the
         surface (primary colour as text is 1:1 on iOS-light orange). */
      .macroFavoritesButton.active-tab {
        color: var(--primary-text-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
      }

			.macroFavorites {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
        overflow: hidden; 
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        position: relative;
        z-index: 4;
      }

			.mf-overlay {
        position: absolute;
        top: 100%; 
        left: 0;
        right: 0;
        z-index: 1; /* Lowered: Sits behind the buttons, above the remote body */
        
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
        
        max-height: 350px;
        overflow-y: auto;
        padding: 12px;
        margin-top: -1px; /* Overlaps the bottom border of the button row for a seamless look */
      }


      .mf-container.drawer-up .mf-overlay {
        top: auto;
        bottom: 100%;

        border-top: 1px solid var(--divider-color);
        border-bottom: none;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-top-left-radius: var(--sb-group-radius);
        border-top-right-radius: var(--sb-group-radius);

        transform-origin: bottom;

        margin-top: 0;
        margin-bottom: -1px; /* Overlaps the top border of the button row for a seamless look */
        box-shadow: 0px -8px 16px rgba(0,0,0,0.25);
      }

			.mf-overlay.open {
        transform: scaleY(1);
        opacity: 1;
        pointer-events: auto;
      }

      /* Device mode: power key sharing the commands strip row. The
         wrapper becomes the positioned ancestor (its .mf-container goes
         static), so the absolutely-positioned commands drawer overlay
         spans the FULL row, bar column plus power column. */
      .commands-row {
        position: relative;
        z-index: 2;
      }
      /* With the bar only 3/4 wide, the overlay's right shoulder sticks
         out past it under the power key. Round that exposed corner with
         the themed radius and restore the edge border there; the bar
         overlaps the left 3/4 of that border (the -1px seam margin), so
         the fused look under the bar is unchanged. */
      .commands-row--power .mf-overlay {
        border-top: 1px solid var(--divider-color);
        border-top-right-radius: var(--sb-group-radius);
      }
      .commands-row--power .drawer-up .mf-overlay {
        border-top-right-radius: var(--sb-group-radius);
        border-bottom: 1px solid var(--divider-color);
        border-bottom-right-radius: var(--sb-group-radius);
      }
      .commands-row--power {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: 8px;
        align-items: stretch;
      }
      .commands-row--power .mf-container {
        position: static;
        min-width: 0;
      }
      .sb-power-key {
        color: var(--sb-power-key-color, var(--primary-color, #03a9f4));
      }
      .commands-row--power-only .sb-power-key {
        /* No sibling strip to stretch against: match the Commands bar
           height (tab height plus its 1px borders). */
        height: calc(var(--sb-tab-height) + 2px);
      }
      .sb-power-key--busy {
        animation: sb-power-busy 1s ease-in-out infinite;
      }
      @keyframes sb-power-busy {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      /* Commands-as-rows: the power key docks beside the pinned filter. */
      .inline-filter-row {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: 8px;
        align-items: stretch;
        margin-bottom: 8px;
      }
      .inline-filter-row .sb-commands-filter {
        margin-bottom: 0;
      }

      .mf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      /* Inline scrollable macros/favorites rows */
      .inline-drawer-row {
        padding: 12px;
        box-sizing: border-box;
      }
      .inline-drawer-row__scroller {
        /* --inline-row-visible-rows controls how many button rows are visible
           before content overflows and becomes scrollable. */
        --inline-row-btn-h: 50px;
        --inline-row-gap: 8px;
        --inline-row-visible-rows: 2;
        max-height: calc(
          var(--inline-row-btn-h) * var(--inline-row-visible-rows)
          + var(--inline-row-gap) * (var(--inline-row-visible-rows) - 1)
        );
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }
      .inline-drawer-row__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .inline-drawer-row__empty {
        text-align: center;
        opacity: 0.6;
        font-size: 13px;
        padding: 8px 0;
      }

      /* Drawer buttons (Macros/Favorites) */
      .drawer-btn {
        height: 50px !important;
        font-size: 13px !important;
        border-radius: var(--sb-group-radius) !important;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }
      /* Same colour language as the keys: names and icons both take the
         icon accent (sb-key-button's label rule is the counterpart). */
      .drawer-btn .name,
      .drawer-btn__icon {
        color: var(--sb-key-label-color, var(--primary-color));
      }

      /* Hover/press overlay  */
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--sb-overlay-hover, color-mix(in srgb, var(--primary-text-color) 10%, transparent));
        opacity: 0;
        transition: opacity 120ms ease;
        pointer-events: none;
      }

      .drawer-btn:hover::before {
        opacity: 1;
      }

      .drawer-btn:active::before {
        opacity: 1;
        background: var(--sb-overlay-press, color-mix(in srgb, var(--primary-text-color) 18%, transparent));
      }

      .drawer-btn:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
        outline-offset: 2px;
      }

      .drawer-btn__inner {
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        position: relative;
        z-index: 1;
      }

      /* Matches default hui-button-card "button" look: centered icon + name */
      .drawer-btn__inner--stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 2px;
        padding: 4px;
      }

      /* Custom favorites: row layout with ellipsis */
      .drawer-btn__inner--row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        padding: 0 12px;
        gap: 10px;
      }

      .drawer-btn--custom .drawer-btn__icon {
        --mdc-icon-size: 18px;
        width: 15% !important;
        flex: 0 0 15%;
      }

      .drawer-btn--custom .name {
        margin: 0 !important;
        text-align: start !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: color-mix(in srgb, var(--primary-color) 14%, transparent);
        color: var(--primary-text-color);
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          ". up ."
          "left ok right"
          ". down .";
        gap: 10px;
        align-items: center;
        justify-items: stretch;
      }
      .dpad .area-up { grid-area: up; }
      .dpad .area-left { grid-area: left; }
      .dpad .area-ok { grid-area: ok; }
      .dpad .area-right { grid-area: right; }
      .dpad .area-down { grid-area: down; }

      /* The UI follows the locale direction, but these are spatial controls:
         changing language must never swap the physical Left/Right keys or the
         fixed rows of buttons on the remote. */
      :host([dir="rtl"]) .dpad,
      :host([dir="rtl"]) .row3,
      :host([dir="rtl"]) .mid,
      :host([dir="rtl"]) .media,
      :host([dir="rtl"]) .colors,
      :host([dir="rtl"]) .abc {
        direction: ltr;
      }

      /* Back / Home / Menu row */
      .row3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      /* Mid: Volume/Channel layout variations */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .mid--dual {
        grid-template-rows: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          "volup mute chup"
          "voldn mute chdn";
      }
      .mid--dual.mid--x2 {
        grid-template-areas:
          "volup guide chup"
          "voldn mute chdn";
      }
      .mid--volume {
        grid-template-rows: 1fr;
        grid-template-areas: "mute voldn volup";
      }
      .mid--channel.mid--x2 {
        grid-template-rows: 1fr;
        grid-template-areas: "guide chdn chup";
      }
      .mid--channel.mid--x1 {
        grid-template-rows: 1fr;
        grid-template-areas: "chdn . chup";
      }
      .mid-btn-volup { grid-area: volup; }
      .mid-btn-voldn { grid-area: voldn; }
      .mid-btn-mute { grid-area: mute; align-self: center; }
      .mid-btn-guide { grid-area: guide; }
      .mid-btn-chup { grid-area: chup; }
      .mid-btn-chdn { grid-area: chdn; }

      /* Media: X1 is 1 row; X2 is 2 rows */
      .media {
        padding: 12px;
        display: grid;
        gap: 10px;
        align-items: stretch;
      }
      .media--play,
      .media--dvr,
      .media--both.media--x1,
      .media--both.media--x2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .media--play {
        grid-template-areas: "rew play fwd";
      }
      .media--play.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--dvr {
        grid-template-areas: "dvr pause exit";
      }
      .media--both.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--both.media--x2 {
        grid-template-areas:
          "rew play fwd"
          "dvr pause exit";
      }
      .media .area-rew   { grid-area: rew; }
      .media .area-play  { grid-area: play; }
      .media .area-fwd   { grid-area: fwd; }
      .media .area-dvr   { grid-area: dvr; }
      .media .area-pause { grid-area: pause; }
      .media .area-exit  { grid-area: exit; }

      /* Colors + ABC blocks */
      .colors, .abc {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .colorsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key.disabled,
      .macroFavoritesButton.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* Shortcuts row (device mode): unconfigured slots keep their grid
         cell. Live mode hides them entirely; the edit preview shows a
         ghost outline so the row's position visualizes before any slot
         is configured. */
      .shortcut-spacer {
        visibility: hidden;
      }
      .shortcut-ghost {
        border: 1px dashed var(--divider-color);
        border-radius: var(--sb-group-radius, var(--ha-card-border-radius, 18px));
        opacity: 0.5;
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key {
  min-width: 0;
  position: relative;
  width: 100%;
  --mdc-typography-button-font-size: var(--sb-key-font-size);
  --paper-font-body1_-_font-size: var(--sb-key-font-size);
  --sb-control-font-size: var(--sb-key-font-size);
}

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
}

/* Re-introduce relative sizing (scales with card width) */
.key--small  { transform: scale(0.82); transform-origin: center; }
.key--normal { transform: scale(0.92); transform-origin: center; }
.key--big    { transform: scale(1.00); transform-origin: center; }
.okKey       { transform: scale(1.06); transform-origin: center; }

/* Keep color keys as strips (not square) */
.key--color {
  aspect-ratio: 3 / 1;
  min-height: var(--sb-color-key-min-height);
  transform: none;
}
/* Color keys are native pill controls. */
      .key--color {
        --sb-control-radius: 999px;
        --sb-control-background: var(--sb-color);
      }

      .warn {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 10;
        font-size: 12px;
        opacity: .9;
        border-inline-start: 3px solid var(--warning-color, orange);
        padding-inline-start: 10px;
      }

      .sb-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        z-index: 999;
      }

      .sb-modal.open {
        display: flex;
      }

      .sb-modal__dialog {
        width: min(420px, 90vw);
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        color: var(--primary-text-color);
        border-radius: 16px;
        border: 1px solid var(--divider-color);
        padding: 16px;
        display: grid;
        gap: 12px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }

      .sb-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .sb-modal__title {
        font-weight: 600;
        font-size: 14px;
      }

      .sb-modal__close {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      .sb-modal__text {
        font-size: 13px;
        opacity: 0.85;
      }

      .sb-modal__optout {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        opacity: 0.85;
      }

      .sb-modal__actions {
        display: grid;
        gap: 8px;
      }

      .sb-modal__link {
        font-size: 12px;
        color: var(--primary-color, #03a9f4);
        text-decoration: underline;
      }
    `;

export const REMOTE_CARD_EDITOR_CSS = `
          .sb-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); z-index: 9999; }
          .sb-modal.open { display: flex; }
          .sb-modal__dialog { width: min(560px, 92vw); max-height: 90vh; overflow: auto; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); padding: 16px; display: grid; gap: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
          .sb-modal__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .sb-modal__title { font-weight: 700; font-size: 18px; }
          .sb-modal__close { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 22px; line-height: 1; }
          .sb-modal__text { font-size: 15px; line-height: 1.5; opacity: 0.95; }
          .sb-modal__optout { display: flex; align-items: center; gap: 8px; font-size: 14px; }
          .sb-modal__actions { display: flex; gap: 8px; justify-content: flex-end; }
          .sb-exp { border: 1px solid var(--divider-color); border-radius: 12px; overflow: visible; }
          .sb-exp-hdr { width: 100%; display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px; background: var(--ha-card-background, transparent); border: 0; cursor: pointer; transition: background-color 120ms ease; }
          .sb-exp-hdr-left { display:flex; align-items:center; gap: 10px; min-width: 0; }
          .sb-exp-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .sb-exp-body { padding: 8px 12px 12px 12px; }
          .sb-exp-collapsed .sb-exp-body { display: none; }
          .sb-exp:not(.sb-exp-collapsed) > .sb-exp-hdr { background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); border-radius: 12px 12px 0 0; }
                    
          .sb-layout-title { font-weight: 600; margin: 10px 0 6px; }
          .sb-layout-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px; }
          .sb-layout-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
          .sb-layout-row-order { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 10px; }
          /* The two "Default ... layout" entries act as section heads in the
             layout selector: a tinted background plus a colored bottom
             border split the list into its activity and device sections.
             The items are our own slotted children of ha-select, so this
             document-level background overrides the component's :host hover
             style — define hover/selected explicitly to keep them alive. */
          .sb-option-default {
            background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06);
            background: color-mix(in srgb, var(--primary-color) 6%, transparent);
            border-bottom: 2px solid rgba(var(--rgb-primary-color, 3, 169, 244), 0.45);
            border-bottom: 2px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
          }
          .sb-option-default:hover {
            background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
            background: color-mix(in srgb, var(--primary-color) 14%, transparent);
          }
          .sb-option-default[selected],
          .sb-option-default[activated] {
            background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18);
            background: color-mix(in srgb, var(--primary-color) 18%, transparent);
          }
          .sb-layout-row + .sb-layout-row { border-top: 1px solid var(--divider-color); }
          .sb-layout-actions { display: inline-flex; align-items:center; gap: 10px; }
          .sb-layout-actions-full { flex: 1; }
          .sb-layout-actions-full ha-select { width: 100%; }
          .sb-layout-note { font-size: 12px; opacity: 0.7; text-align: end; padding: 2px 0 6px; }
          .sb-icon-btn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--divider-color); background: var(--ha-card-background, transparent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
          .sb-icon-btn[disabled] { opacity: 0.4; cursor: default; }
          .sb-layout-footer { margin-top: 10px; display:flex; justify-content:flex-end; }
          .sb-reset-btn { border: 1px solid var(--divider-color); border-radius: 10px; padding: 6px 10px; background: transparent; cursor:pointer; }
          .sb-switch { display:flex; align-items:center; }
          .sb-styling-wrap { padding: 0 0 12px 0; }
          .sb-layout-switch-item { display:flex; align-items:center; gap:8px; min-width: 0; }
          .sb-layout-switch-item.is-disabled { opacity: 0.45; pointer-events: none; }
          .sb-layout-switch-item-empty { visibility: hidden; }
          .sb-layout-switch-label { font-size: 13px; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .sb-mf-rows-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.04); border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 12px; margin: 8px 0; }
          /* This label explains the switch next to it — translations can be long, so wrap instead of ellipsing. */
          .sb-mf-rows-row .sb-layout-switch-label { white-space: normal; overflow: visible; text-overflow: clip; }
          .sb-mf-rows-row + .sb-layout-row { border-top: 0; }
          .sb-mf-rows-stepper-item { gap: 10px; justify-self: end; }
          .sb-mf-rows-stepper-item.is-disabled { opacity: 0.45; pointer-events: none; }
          .sb-rows-stepper { display: inline-flex; align-items: center; gap: 6px; }
          .sb-rows-stepper .sb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
          .sb-rows-value { min-width: 24px; text-align: center; font-variant-numeric: tabular-nums; font-size: 14px; font-weight: 600; }
          .sb-move-wrap { display:flex; flex-direction:row; align-items:center; gap:6px; justify-self: end; }
          .sb-drag-handle { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; justify-self: end; color: var(--secondary-text-color); cursor: grab; touch-action: none; }
          .sb-drag-handle:active { cursor: grabbing; }
          .sb-drag-handle ha-icon { --mdc-icon-size: 20px; }
          /* Shortcuts slot editing on the group-order row: the three mini
             slot buttons fill the row's second cell; the open slot's panel
             drops out inside the row, spanning its grid (never a popover —
             the panel's icon picker and command select open popup menus of
             their own, and nested popups fight outside-click detection).
             The caret rides on the open slot, so it stays anchored to the
             button that opened the panel. */
          .sb-shortcut-strip { display: inline-flex; gap: 8px; min-width: 0; }
          .sb-shortcut-slot { position: relative; width: 40px; height: 30px; border: 1px dashed var(--secondary-text-color, var(--divider-color)); border-radius: 8px; background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.05); background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; color: var(--primary-color); flex: 0 1 auto; min-width: 26px; }
          .sb-shortcut-slot.is-configured { background: var(--ha-card-background, transparent); }
          .sb-shortcut-slot ha-icon { --mdc-icon-size: 18px; }
          .sb-shortcut-slot.is-configured { border-style: solid; }
          .sb-shortcut-slot.is-open { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color) inset; }
          .sb-shortcut-slot.is-open::after { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: var(--primary-color); pointer-events: none; }
          .sb-shortcut-panel { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; margin: 2px 0 4px; border: 1px solid var(--divider-color); border-radius: 10px; padding: 10px 12px; background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.04); }
          .sb-shortcut-panel ha-form { display: block; }
          .sb-shortcut-panel-footer { display: flex; justify-content: flex-end; }
          .sb-shortcut-note { font-size: 12px; color: var(--secondary-text-color); line-height: 1.35; }
          .sb-layout-row-order.sortable-ghost { opacity: 0.35; }
          .sb-layout-row-order.sortable-chosen { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06); background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
          /* General Options rows: label + description with the switch at the
             end; a row's sub-controls (ha-form) sit below, indented to the
             label column. Rows are separated by the divider line. */
          .sb-opt-list { display: flex; flex-direction: column; }
          .sb-opt-row { padding: 8px 0; }
          .sb-opt-row + .sb-opt-row { border-top: 1px solid var(--divider-color); }
          .sb-opt-head { display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; }
          .sb-opt-main { display:flex; flex-direction:column; gap: 4px; flex: 1; min-width: 0; }
          .sb-opt-label-wrap { display:flex; align-items:center; gap: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .sb-opt-label { line-height: 1.2; }
          .sb-opt-desc { font-size: 13px; color: var(--secondary-text-color); line-height: 1.3; }
          .sb-opt-link { color: var(--secondary-text-color); display:flex; align-items:center; justify-content:center; text-decoration:none; opacity: 0.85; }
          .sb-opt-link:hover { color: var(--primary-color); opacity: 1; }
          .sb-opt-link ha-icon { --mdc-icon-size: 16px; }
          .sb-opt-row--form ha-form { display: block; }
          .sb-opt-sub { padding: 10px 0 2px; }
          .sb-opt-sub ha-form { display: block; }
          /* Sub-option label + checkbox list (long press buttons): the label
             sits in the row's label column at description size, the
             checkboxes are indented beneath it. The checkbox labels take
             their size from HA's component vars, not from inherited
             font-size: web-awesome ha-checkbox reads --wa-font-size-m (HA
             2026.x), the older MDC ha-formfield reads the typography var,
             so pin all of them to the description size. */
          .sb-opt-sub-label { font-size: 13px; font-weight: 500; line-height: 1.3; }
          .sb-opt-sub--list ha-form {
            padding-inline-start: 12px;
            font-size: 13px;
            --wa-font-size-m: 13px;
            --mdc-typography-body2-font-size: 13px;
            --mdc-typography-body2-line-height: 1.3;
            --ha-font-size-m: 13px;
          }
          .sb-command-sync-row { margin: 0 0 12px; border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
          .sb-command-sync-row-running { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.10); background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
          .sb-command-sync-row-error { border-color: var(--error-color); background: rgba(var(--rgb-error-color, 219, 68, 55), 0.10); background: color-mix(in srgb, var(--error-color) 10%, transparent); }
          .sb-command-sync-row-ok { border-color: var(--success-color, #22c55e); border-color: color-mix(in srgb, var(--success-color, #22c55e) 70%, var(--divider-color)); background: rgba(34, 197, 94, 0.12); background: color-mix(in srgb, var(--success-color, #22c55e) 12%, transparent); }
          .sb-command-sync-message-wrap { display:flex; align-items:center; gap: 8px; min-width: 0; }
          .sb-command-sync-message-wrap ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
          .sb-command-sync-row-ok .sb-command-sync-message-wrap ha-icon { color: var(--success-color, #22c55e); }
          .sb-command-sync-row-error .sb-command-sync-message-wrap ha-icon { color: var(--error-color); }
          .sb-command-sync-row-running .sb-command-sync-message-wrap ha-icon { color: var(--primary-color); }
          .sb-command-sync-message { font-size: 13px; color: var(--secondary-text-color); }
          .sb-command-sync-btn { border: 1px solid var(--primary-color); border-radius: 10px; min-height: 34px; padding: 0 12px; background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-text-color); cursor: pointer; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-sync-btn:hover { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.28); background: color-mix(in srgb, var(--primary-color) 28%, transparent); border-color: var(--primary-color); border-color: color-mix(in srgb, var(--primary-color) 85%, #000); }
          .sb-command-sync-btn:active { transform: translateY(1px); }
          .sb-command-sync-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 3, 169, 244), 0.45); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent); }
          .sb-command-sync-btn[disabled],
          .sb-command-sync-btn.sb-command-sync-btn-static { opacity: 0.6; cursor: default; transform: none; pointer-events: none; }
          .sb-command-sync-btn.sb-command-sync-btn-static { display: inline-flex; align-items: center; }
          .sb-command-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .sb-command-slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: start; display:flex; flex-direction:column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-btn:hover { border-color: var(--primary-color); }
          .sb-command-slot-main { position: relative; display:flex; align-items:flex-start; gap: 8px; padding: 14px 12px 10px; min-width: 0; }
                    .sb-command-slot-icon-wrap { width: 20px; min-width: 20px; min-height: 20px; display:flex; align-items:center; justify-content:center; }
          .sb-command-slot-icon-wrap ha-icon { --mdc-icon-size: 20px; color: var(--state-icon-color); }
          .sb-command-slot-name { font-weight: 700; font-size: 16px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
          .sb-command-slot-meta { margin-top: 3px; font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display:flex; align-items:center; gap: 4px; }
          .sb-command-slot-favorite { color: var(--error-color); display:inline-flex; }
          .sb-command-slot-favorite ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-meta-icon { color: var(--state-icon-color); display:inline-flex; }
          .sb-command-slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-text-wrap { min-width: 0; padding-top: 1px; flex: 1; }
          .sb-command-slot-clear { position: absolute; top: 8px; inset-inline-end: 8px; width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; padding: 0; cursor: pointer; z-index: 1; opacity: 0.9; }
          .sb-command-slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
          .sb-command-slot-clear ha-icon { --mdc-icon-size: 16px; }
          .sb-command-slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: start; padding: 10px 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-slot-action-btn:hover { border-color: var(--primary-color); background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-action-btn:active { transform: translateY(1px); }
          .sb-command-slot-action-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--primary-color); }
          .sb-command-slot-confirm { padding: 14px 12px 10px; display:flex; flex-direction:column; }
          .sb-command-slot-confirm-title { font-weight: 700; font-size: 16px; line-height: 1.15; color: var(--primary-text-color); }
          .sb-command-slot-confirm-sub { margin-top: 1px; font-size: 12px; color: var(--secondary-text-color); }
          .sb-command-slot-confirm-actions { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 10px 10px; }
          .sb-command-slot-confirm-actions .sb-command-slot-action-btn { margin: 0; text-align: center; justify-content: center; display:flex; align-items:center; }
          .sb-command-slot-empty { border-color: var(--divider-color); background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); }
          .sb-command-slot-empty .sb-command-slot-main { gap: 12px; align-items: center; justify-content: center; flex-direction: column; }
          .sb-command-slot-empty .sb-command-slot-empty-text { font-size: 64px; line-height: 1; color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; opacity: 0.8; }
          .sb-command-slot-empty .sb-command-slot-name { font-size: 18px; font-weight: 500; text-align: center; color: var(--secondary-text-color); }
          .sb-command-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.52); display:none; align-items:center; justify-content:center; padding: 18px; }
          .sb-command-modal.open { display:flex; }
          .sb-command-dialog { width: min(640px, 100%); max-height: min(680px, 100%); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); display:flex; flex-direction:column; overflow:hidden; box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); }
          .sb-command-dialog-header { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--divider-color); }
          .sb-command-dialog-title { font-size: 16px; font-weight: 700; }
          .sb-command-dialog-close { border: 0; background: transparent; cursor: pointer; color: inherit; display:flex; align-items:center; justify-content:center; }
          .sb-command-dialog-body { padding: 16px; display:flex; flex-direction:column; gap: 12px; overflow:auto; }
          .sb-command-dialog-footer { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--divider-color); }
          .sb-command-dialog-footer-note { font-size: 13px; color: var(--error-color); text-align: start; }
          .sb-command-dialog-footer-actions { display:flex; align-items:center; justify-content:flex-end; gap: 8px; margin-inline-start: auto; }
          .sb-command-dialog-btn { border: 1px solid var(--divider-color); border-radius: 10px; min-height: 36px; padding: 0 12px; background: var(--ha-card-background, var(--card-background-color)); color: var(--primary-text-color); cursor: pointer; font-size: 14px; }
          .sb-command-dialog-btn:hover { border-color: var(--primary-color); }
          .sb-command-dialog-btn-primary { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-hub-version-warn-btn { all: unset; cursor: pointer; text-decoration: underline; display: block; }
          .sb-hub-version-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
          .sb-hub-version-chip { border: 1px solid var(--divider-color); border-radius: 20px; padding: 4px 14px; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 13px; }
          .sb-hub-version-chip.active { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-note { border: 1px solid var(--divider-color); border: 1px solid color-mix(in srgb, var(--info-color, var(--primary-color)) 42%, var(--divider-color)); border-radius: 12px; padding: 12px; background: var(--ha-card-background, var(--card-background-color)); background: color-mix(in srgb, var(--info-color, var(--primary-color)) 12%, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 13px; line-height: 1.45; display:flex; align-items:flex-start; gap:10px; }
          .sb-command-dialog-note::before { content: ""; width: 18px; height: 18px; border-radius: 50%; background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.22); background: color-mix(in srgb, var(--info-color, var(--primary-color)) 22%, transparent); flex: 0 0 18px; margin-top: 1px; }
          .sb-command-config-block { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; display:flex; flex-direction:column; gap:12px; }
          .sb-command-input-row { display:flex; flex-direction:column; gap:6px; }
          .sb-command-input-label { font-size: 12px; opacity: 0.78; }
          .sb-command-name-field { width: 100%; }
          .sb-command-input-select { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, transparent); color: inherit; min-height: 40px; padding: 6px 12px; }
          .sb-command-checkbox { width: 100%; border: 0; background: transparent; padding: 0; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size: 13px; cursor: pointer; color: inherit; }
          .sb-command-checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: var(--ha-card-background, rgba(0, 0, 0, 0.12)); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display:flex; align-items:center; justify-content:center; transition: background-color 120ms ease, border-color 120ms ease; }
          .sb-command-checkbox-icon ha-icon { --mdc-icon-size: 16px; }
          .sb-command-checkbox-left { display:flex; align-items:center; gap:10px; }
          .sb-command-checkbox.sb-command-favorite-active .sb-command-checkbox-icon { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.20); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
          .sb-command-helper { font-size: 12px; opacity: 0.8; margin-top: 2px; }
          .sb-command-activity-chip-row { display:flex; flex-wrap:wrap; gap:8px; }
          .sb-command-activity-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, rgba(0, 0, 0, 0.1)); background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; cursor: pointer; }
          .sb-command-activity-chip.active { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.20); background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); }
          .sb-command-action-wrap { display:flex; flex-direction:column; gap:8px; }
          .sb-command-action-tabs { display:flex; gap:8px; }
          .sb-command-action-tab { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, rgba(0, 0, 0, 0.1)); background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 8px 12px; cursor:pointer; font: inherit; }
          .sb-command-action-tab.active { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-body ha-textfield,
          .sb-command-dialog-body ha-selector { width: 100%; }
          @media (max-width: 760px) {
            .sb-command-grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 700px) {
            .sb-command-modal { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
            .sb-command-dialog { width: 100%; max-height: 100%; border-radius: 0 0 16px 16px; }
            .sb-command-dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
          }
        `;
