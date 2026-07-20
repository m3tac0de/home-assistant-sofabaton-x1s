// Shared imperative wiring helpers for the Lit card's sections: attach the
// gesture-gated primary action once per DOM node while keeping the handler
// current across re-renders, and add capture-phase listeners for the
// version-dependent ha-select open/close event names.

import { ref } from "lit/directives/ref.js";
import { attachPrimaryAction } from "../remote-card-gestures";

interface WiredElement extends Element {
  __sbActionWired?: boolean;
  __sbTrigger?: (ev: Event) => void;
  __sbListenersWired?: boolean;
}

/**
 * Element-part directive: wires attachPrimaryAction once per node; subsequent
 * renders only swap the stored handler. The haptic event is dispatched from
 * the node itself (bubbles + composed, so it reaches the document like the
 * legacy card's host-dispatched one).
 */
export function primaryActionRef(handler: (ev: Event) => void) {
  return ref((el) => {
    if (!el) return;
    const node = el as WiredElement;
    node.__sbTrigger = handler;
    if (node.__sbActionWired) return;
    node.__sbActionWired = true;
    attachPrimaryAction(
      node,
      (ev) => node.__sbTrigger?.(ev),
      {
        fireHaptic: () => {
          node.dispatchEvent(
            new CustomEvent("haptic", {
              detail: "light",
              bubbles: true,
              composed: true,
            }),
          );
        },
      },
    );
  });
}

/** Add listeners once per node (capture-phase optional). */
export function listenersRef(
  wire: (el: Element) => void,
) {
  return ref((el) => {
    if (!el) return;
    const node = el as WiredElement;
    if (node.__sbListenersWired) return;
    node.__sbListenersWired = true;
    wire(node);
  });
}
