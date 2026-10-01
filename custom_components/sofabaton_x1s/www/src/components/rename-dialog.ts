import { html, nothing } from "lit";
import { useLegacyTextField } from "../tabs/edit-detail/names";
import { TOOLS_CARD_STRINGS } from "../strings";

/**
 * The card's small rename dialog: the same markup and classes as the backup
 * editor's hub / entity rename dialogs (card-styles.ts carries the dialog
 * rules for hosts that render inside the card's own shadow root). The
 * caller owns the draft, sanitizes it in `onInput`, and decides in
 * `onConfirm` whether the dialog closes.
 */
export function renderRenameDialog(params: {
  open: boolean;
  title: string;
  label: string;
  value: string;
  error: string;
  maxLength: number;
  busy: boolean;
  inputId: string;
  onInput: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!params.open) return nothing;
  const handleInput = (event: Event) => {
    const input = event.currentTarget as HTMLElement & { value: string };
    params.onInput(input.value);
    // The host may have sanitized the draft; reflect it into the field.
    if (input.value !== params.value) input.value = params.value;
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!params.busy) params.onConfirm();
  };
  const cancel = () => {
    if (!params.busy) params.onCancel();
  };
  return html`
    <div class="modal-backdrop" @click=${cancel}>
      <div class="dialog small" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
        <div class="dialog-header">
          <div class="dialog-title">${params.title}</div>
          <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} ?disabled=${params.busy} @click=${cancel}><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <div class="dialog-body">
          ${useLegacyTextField()
            ? html`
                <ha-textfield
                  id=${params.inputId}
                  .label=${params.label}
                  .maxLength=${params.maxLength}
                  .value=${params.value}
                  ?disabled=${params.busy}
                  @input=${handleInput}
                  @change=${handleInput}
                  @keydown=${handleKeydown}
                ></ha-textfield>
              `
            : html`
                <ha-input
                  id=${params.inputId}
                  type="text"
                  .label=${params.label}
                  .maxlength=${params.maxLength}
                  .value=${params.value}
                  ?disabled=${params.busy}
                  @input=${handleInput}
                  @change=${handleInput}
                  @keydown=${handleKeydown}
                ></ha-input>
              `}
        </div>
        <div class="dialog-footer">
          <div class="dialog-footer-note">${params.error}</div>
          <div class="dialog-footer-actions">
            <button class="dialog-btn" ?disabled=${params.busy} @click=${cancel}>${TOOLS_CARD_STRINGS.common.cancel}</button>
            <button class="dialog-btn dialog-btn-primary" ?disabled=${params.busy} @click=${params.onConfirm}>${TOOLS_CARD_STRINGS.common.save}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
