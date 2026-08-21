import test from "node:test";
import assert from "node:assert/strict";
import {
  LONG_PRESS_GROUPS,
  longPressEnabledForKey,
  longPressEnabledPatch,
  longPressGroupForKey,
  longPressGroupsPatch,
  longPressSelectedGroups,
  longPressSettings,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-long-press";
import {
  HOLD_REPEAT_DELAY_MS,
  HOLD_REPEAT_INTERVAL_MS,
  HoldRepeatTimer,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-gestures";

// ---------- config helpers ----------

test("long press is off unless the block says enabled: true", () => {
  assert.deepEqual(longPressSettings(null), {
    enabled: false,
    volume: false,
    channel: false,
    dpad: false,
  });
  assert.equal(longPressSettings({ long_press: {} }).enabled, false);
  assert.equal(longPressSettings({ long_press: { volume: true } }).enabled, false);
  assert.equal(longPressSettings({ long_press: { enabled: false } }).enabled, false);
  // A disabled block never enables any group, whatever it says otherwise.
  assert.deepEqual(longPressSelectedGroups({ long_press: { volume: true } }), []);
});

test("enabling long press turns every group on; only explicit false opts out", () => {
  assert.deepEqual(longPressSettings({ long_press: { enabled: true } }), {
    enabled: true,
    volume: true,
    channel: true,
    dpad: true,
  });
  assert.deepEqual(
    longPressSettings({ long_press: { enabled: true, channel: false } }),
    { enabled: true, volume: true, channel: false, dpad: true },
  );
  assert.deepEqual(
    longPressSelectedGroups({ long_press: { enabled: true, volume: false, dpad: false } }),
    ["channel"],
  );
});

test("key specs map to their long-press group; mute, OK and the rest never repeat", () => {
  assert.equal(longPressGroupForKey("volup"), "volume");
  assert.equal(longPressGroupForKey("voldn"), "volume");
  assert.equal(longPressGroupForKey("chup"), "channel");
  assert.equal(longPressGroupForKey("chdn"), "channel");
  for (const key of ["up", "down", "left", "right"]) {
    assert.equal(longPressGroupForKey(key), "dpad", key);
  }
  for (const key of ["mute", "ok", "guide", "back", "home", "menu", "play", "red", "a", "", null]) {
    assert.equal(longPressGroupForKey(key), null, String(key));
  }

  const config = { long_press: { enabled: true, dpad: false } };
  assert.equal(longPressEnabledForKey(config, "volup"), true);
  assert.equal(longPressEnabledForKey(config, "chdn"), true);
  assert.equal(longPressEnabledForKey(config, "left"), false);
  assert.equal(longPressEnabledForKey(config, "mute"), false);
  assert.equal(longPressEnabledForKey({}, "volup"), false);
});

test("enable patch stores the minimal block; disable drops it", () => {
  assert.deepEqual(longPressEnabledPatch(true), { enabled: true });
  assert.equal(longPressEnabledPatch(false), undefined);
});

test("groups patch stores selected groups as absence and deselected as false", () => {
  assert.deepEqual(longPressGroupsPatch({ enabled: true }, ["volume", "channel", "dpad"]), {
    enabled: true,
  });
  assert.deepEqual(longPressGroupsPatch({ enabled: true }, ["channel"]), {
    enabled: true,
    volume: false,
    dpad: false,
  });
  // Re-selecting a group removes its explicit false again.
  assert.deepEqual(
    longPressGroupsPatch({ enabled: true, volume: false, dpad: false }, ["volume", "channel"]),
    { enabled: true, dpad: false },
  );
  // Unknown names are ignored; an empty selection turns every group off.
  assert.deepEqual(longPressGroupsPatch({ enabled: true }, ["bogus"]), {
    enabled: true,
    volume: false,
    channel: false,
    dpad: false,
  });
  assert.deepEqual(LONG_PRESS_GROUPS, ["volume", "channel", "dpad"]);
});

// ---------- hold-to-repeat timer ----------

/** Deterministic timer scheduler: advance(ms) runs due timeouts/intervals in order. */
function createScheduler() {
  let now = 0;
  let nextId = 1;
  const entries = new Map<number, { due: number; every: number | null; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++;
        entries.set(id, { due: now + ms, every: null, fn });
        return id;
      },
      clearTimeout: (handle: unknown) => {
        entries.delete(handle as number);
      },
      setInterval: (fn: () => void, ms: number) => {
        const id = nextId++;
        entries.set(id, { due: now + ms, every: ms, fn });
        return id;
      },
      clearInterval: (handle: unknown) => {
        entries.delete(handle as number);
      },
    },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let nextEntry: [number, { due: number; every: number | null; fn: () => void }] | null = null;
        for (const entry of entries) {
          if (entry[1].due <= target && (!nextEntry || entry[1].due < nextEntry[1].due)) {
            nextEntry = entry;
          }
        }
        if (!nextEntry) break;
        const [id, entry] = nextEntry;
        now = entry.due;
        if (entry.every == null) {
          entries.delete(id);
        } else {
          entry.due += entry.every;
        }
        entry.fn();
      }
      now = target;
    },
    pending: () => entries.size,
  };
}

test("a tap shorter than the delay never repeats and leaves no fired memory", () => {
  const scheduler = createScheduler();
  const fired: number[] = [];
  const timer = new HoldRepeatTimer((n) => fired.push(n), scheduler.timers);

  timer.start();
  assert.equal(timer.active, true);
  scheduler.advance(HOLD_REPEAT_DELAY_MS - 1);
  assert.equal(timer.stop(), false);
  assert.deepEqual(fired, []);
  assert.equal(timer.active, false);
  assert.equal(timer.consumeFired(), false);
  assert.equal(scheduler.pending(), 0);
});

test("a hold fires after the delay, then every interval, until stopped", () => {
  const scheduler = createScheduler();
  const fired: number[] = [];
  const timer = new HoldRepeatTimer((n) => fired.push(n), scheduler.timers);

  timer.start();
  scheduler.advance(HOLD_REPEAT_DELAY_MS);
  assert.deepEqual(fired, [1]);
  scheduler.advance(HOLD_REPEAT_INTERVAL_MS * 3);
  assert.deepEqual(fired, [1, 2, 3, 4]);
  assert.equal(timer.repeatCount, 4);

  // stop() reports the hold fired; the release tap then consumes it once.
  assert.equal(timer.stop(), true);
  assert.equal(scheduler.pending(), 0);
  scheduler.advance(HOLD_REPEAT_INTERVAL_MS * 5);
  assert.deepEqual(fired, [1, 2, 3, 4]);
  assert.equal(timer.consumeFired(), true);
  assert.equal(timer.consumeFired(), false);
});

test("start() resets the fired memory so the next tap is not swallowed", () => {
  const scheduler = createScheduler();
  const fired: number[] = [];
  const timer = new HoldRepeatTimer((n) => fired.push(n), scheduler.timers);

  timer.start();
  scheduler.advance(HOLD_REPEAT_DELAY_MS);
  assert.equal(timer.stop(), true);
  // The release tap never came (mouse dragged off); a new press starts clean.
  timer.start();
  assert.equal(timer.consumeFired(), false);
  scheduler.advance(10);
  assert.equal(timer.stop(), false);
  assert.deepEqual(fired, [1]);
});

test("restarting while armed replaces the pending hold instead of stacking timers", () => {
  const scheduler = createScheduler();
  const fired: number[] = [];
  const timer = new HoldRepeatTimer((n) => fired.push(n), scheduler.timers);

  timer.start();
  scheduler.advance(HOLD_REPEAT_DELAY_MS - 50);
  timer.start();
  scheduler.advance(HOLD_REPEAT_DELAY_MS - 50);
  assert.deepEqual(fired, []);
  scheduler.advance(50);
  assert.deepEqual(fired, [1]);
  assert.equal(scheduler.pending(), 1);
  timer.stop();
});

test("a throwing fire callback does not stop the repeat loop", () => {
  const scheduler = createScheduler();
  let calls = 0;
  const timer = new HoldRepeatTimer(
    () => {
      calls += 1;
      throw new Error("send failed");
    },
    { ...scheduler.timers, delayMs: 100, intervalMs: 50 },
  );
  timer.start();
  scheduler.advance(200);
  assert.equal(calls, 3);
  assert.equal(timer.stop(), true);
});
