import test from "node:test";
import assert from "node:assert/strict";
import type { ReactiveControllerHost } from "lit";
import { ListenerPortsFormController } from "../../custom_components/sofabaton_x1s/www/src/components/listener-ports-form";
import { TOOLS_CARD_STRINGS, setToolsCardLanguage } from "../../custom_components/sofabaton_x1s/www/src/strings";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";

test("port failures use the current language and never display backend diagnostics", async () => {
  const ports = { hub_listen_base: 8200, proxy_udp_port: 8102, roku_listen_port: 8060 };
  const host = { addController() {}, requestUpdate() {}, updateComplete: Promise.resolve(true) } as unknown as ReactiveControllerHost;
  try {
    for (const locale of ["en", "de", "es", "fr", "nl", "zh-hans"]) {
      setToolsCardLanguage(locale);
      for (const code of ["busy", "unexpected_failure"]) {
        // Cover both the store's structured outcome and an unexpected rejected call.
        for (const rejects of [false, true]) {
          const form = new ListenerPortsFormController(host, async () => {
            if (rejects) throw { code, message: "English backend diagnostic" };
            return { kind: "error", code };
          });
          form.openWith(ports, ports);
          (form as any)._values.hub_listen_base = "8300";
          await form.submit();
          assert.equal((form as any)._error, code === "busy" ? TOOLS_CARD_STRINGS.settings.portsBusy : TOOLS_CARD_STRINGS.settings.portsFailed, `${locale}: ${code}`);
          assert.equal(form.open, true);
          assert.equal(form.busy, false);
        }
      }
    }
  } finally {
    setToolsCardLanguage("en");
  }
});
