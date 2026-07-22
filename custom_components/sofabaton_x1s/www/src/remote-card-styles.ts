// Stylesheets for the remote card and its config editor, extracted verbatim
// from the legacy monolith so the strings can be shared with the Lit port
// (wrap with unsafeCSS for static styles). Byte-identical to the previous
// inline template literals.

export const REMOTE_CARD_CSS = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        --sb-overlay-rgb: var(--rgb-primary-text-color, 0, 0, 0);

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

      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
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
      }

      .activityRow { 
        display: grid; 
        grid-template-columns: 1fr; 
        position: relative;
        z-index: 3;
      }

      .automationAssist {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: var(--sb-group-radius);
        border: 1px solid rgba(var(--rgb-primary-color), 0.25);
        background: rgba(var(--rgb-primary-color), 0.08);
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
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__mqttBtn {
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
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
        background: rgba(var(--rgb-primary-color), 0.16);
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


 	  .loadIndicator {
	    visibility: hidden;
	    height: 4px;
	    width: 100%;
	    border-radius: 2px;
	    pointer-events: none;
	  }

	  .loadIndicator.is-loading {
	    visibility: visible;
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
        padding: 4px 0;
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
      
      .macroFavoritesButton.active-tab {
        color: var(--primary-color);
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

      /* Hover/press overlay  */
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(var(--sb-overlay-rgb), 0.08);
        opacity: 0;
        transition: opacity 120ms ease;
        pointer-events: none;
      }

      .drawer-btn:hover::before {
        opacity: 1;
      }

      .drawer-btn:active::before {
        opacity: 1;
        background: rgba(var(--sb-overlay-rgb), 0.16);
      }

      .drawer-btn:focus-visible {
        outline: 2px solid rgba(var(--rgb-primary-color), 0.55);
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
        text-align: left !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
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
        border-left: 3px solid var(--warning-color, orange);
        padding-left: 10px;
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
          .sb-layout-row + .sb-layout-row { border-top: 1px solid var(--divider-color); }
          .sb-layout-actions { display: inline-flex; align-items:center; gap: 10px; }
          .sb-layout-actions-full { flex: 1; }
          .sb-layout-actions-full ha-select { width: 100%; }
          .sb-layout-note { font-size: 12px; opacity: 0.7; text-align: right; padding: 2px 0 6px; }
          .sb-icon-btn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--divider-color); background: var(--ha-card-background, transparent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
          .sb-icon-btn[disabled] { opacity: 0.4; cursor: default; }
          .sb-layout-footer { margin-top: 10px; display:flex; justify-content:flex-end; }
          .sb-reset-btn { border: 1px solid var(--divider-color); border-radius: 10px; padding: 6px 10px; background: transparent; cursor:pointer; }
          .sb-switch { display:flex; align-items:center; }
          .sb-styling-wrap { padding: 0 0 12px 0; }
          .sb-styling-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; }
          .sb-layout-switch-item { display:flex; align-items:center; gap:8px; min-width: 0; }
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
          .sb-layout-row-order.sortable-ghost { opacity: 0.35; }
          .sb-layout-row-order.sortable-chosen { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06); background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
          .sb-commands-wrap { padding: 0 0 12px 0; }
          .sb-commands-meta { margin-bottom: 12px; }
          .sb-yaml-helper-row { display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
          .sb-yaml-helper-drag { color: var(--secondary-text-color); opacity: 0.75; padding-top: 2px; }
          .sb-yaml-helper-drag ha-icon { --mdc-icon-size: 20px; }
          .sb-yaml-helper-main { display:flex; flex-direction:column; gap: 4px; flex: 1; min-width: 0; }
          .sb-yaml-helper-label-wrap { display:flex; align-items:center; gap: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .sb-yaml-helper-label { line-height: 1.2; }
          .sb-yaml-helper-desc { font-size: 13px; color: var(--secondary-text-color); line-height: 1.3; }
          .sb-yaml-helper-link { color: var(--secondary-text-color); display:flex; align-items:center; justify-content:center; text-decoration:none; opacity: 0.85; }
          .sb-yaml-helper-link:hover { color: var(--primary-color); opacity: 1; }
          .sb-yaml-helper-link ha-icon { --mdc-icon-size: 16px; }
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
          .sb-command-slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: left; display:flex; flex-direction:column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
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
          .sb-command-slot-clear { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; padding: 0; cursor: pointer; z-index: 1; opacity: 0.9; }
          .sb-command-slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
          .sb-command-slot-clear ha-icon { --mdc-icon-size: 16px; }
          .sb-command-slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
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
          .sb-command-dialog-footer-note { font-size: 13px; color: var(--error-color); text-align: left; }
          .sb-command-dialog-footer-actions { display:flex; align-items:center; justify-content:flex-end; gap: 8px; margin-left: auto; }
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
