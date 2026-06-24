# Sofabaton Control Panel: Blobs

Use the **Blobs** tab in the **Sofabaton Control Panel** card to work with the
hub's real stored command payloads.

The short version:

- A **Blob** is the actual payload the hub stores for a command.
- A command name and command id are just the user-facing label and index for
  that payload.
- All device types (IR, RF, BT etc) store commands as blobs.
- In this integration blobs for all device types can be viewed, but **only IR blobs should be Tested or Saved**.

## What is a Blob?

At the Sofabaton UI level, you normally think in terms of devices and commands:
`Power`, `Volume Up`, `HDMI 1`, and so on.

Under the hood, the hub stores a payload for each command. That payload is what
this integration calls a **Blob**.

Think of it like this:

- **Command name**: what you see in the UI
- **Command id**: the hub's index for that command
- **Blob**: the real command data behind it

That idea is not limited to IR. The hub stores command payloads for all device
types this way.

## What the Blobs tab is for

Open the **Blobs** tab in the Control Panel card when you want to:

1. Fetch a command's stored payload from the hub
2. Test an IR blob without saving it
3. Save a new IR command onto an existing IR device

This makes blobs useful for both learning and real-world command creation.

Examples:

- You can fetch a known-good IR command from your own hub and keep it as a
  backup.
- You can share an IR blob with another user.
- You can take IR data from online databases, use IrScrutinizer to turn it into
  a usable blob, then test and save it to the hub.

## Important rule: IR only for Test and Save

This is the most important rule on this page:

**Only test and save blobs that belong to IR devices.**

- It is fine to **Fetch** blobs to learn how the hub stores commands.
- Only use **Test A Blob** and **Save To Hub** with **IR blobs**.
- Do not treat Wifi, Bluetooth, Roku, Hue, IP, or MQTT blobs as if they were
  interchangeable with IR commands.

The integration in its current form cannot reliably block you from Testing or Saving a non-IR Blob, so this is all you.

## The Blobs tab workflow

The Control Panel card breaks blob work into three sections:

1. **Fetch From Hub**
2. **Test A Blob**
3. **Save To Hub**

### 1. Fetch From Hub

Use **Fetch From Hub** to retrieve a blob from an existing command on your hub.

This section is driven by the cached hub/device/command data used elsewhere in
the Control Panel card, so there are two things to know first:

- **Persistent cache must be enabled** in the **Settings** tab
- Your device and command lists should be current, so refresh them in the
  **Cache** tab if needed

### 2. Test A Blob

Use **Test A Blob** when you want the hub to try an IR blob once, without
saving it as a command.

This is the safest way to validate a blob before you commit it to a device.

Good uses for Test:

- A blob you just fetched from the hub
- A blob shared by another user
- A blob created from online IR data and IrScrutinizer

If the test works, you can move on to **Save To Hub**.
If it does not, nothing has been added to the hub's command list.

### 3. Save To Hub

Use **Save To Hub** to create a new command on an existing **IR device**.  
The IR devices shown as available are retrieved from Cache, so make sure its up to date.

The workflow is:

1. Choose the target IR device
2. Enter a command name
3. Paste the blob
4. Save it to the hub

The new command is then stored on that IR device as a regular hub command.

## Different IR Blob types

There are 2 main ways that a Sofabaton hub stores IR Blobs:

- The **raw IR format** describes the signal by its actual transmitted timings: carrier frequency plus the sequence of mark/space durations. It is a low-level recording of what the hub should send. The **raw IR format** is supported on **all hubs**.
- The **descriptive format** describes the same signal by its decoded protocol and parameter values, like `P:Sony12 R:40000 D:1 F:18 MUL:2`. It is a higher-level, human-readable representation of what the signal means. The **descriptive format** is supported on the **X2 hub only** (i think).

Users can build entirely new IR blobs from published IR
protocol data instead of only reusing commands already stored on the hub.

In practice, this means the Control Panel card can work with:

- blobs fetched from an existing hub command
- blobs shared by other users
- blobs derived from online IR databases with [IrScrutinizer](../IrScrutinizer/README.md)

## Sharing blobs with other users

One of the most useful things about IR blobs is that they are easy to share.

When sharing a blob, it helps to include:

- device brand and model
- what the command does
- whether it came from a learned command, an online database, or a generated
  IrScrutinizer export

## Using online IR databases and IrScrutinizer

The Blobs tab is also useful when the command is not already on your hub.

A possible workflow is:

1. Find IR protocol data in an online database
2. Use [IrScrutinizer](../IrScrutinizer/README.md) to turn that data into a blob-friendly IR representation
3. Paste it into **Test A Blob**
4. If it works, save it with **Save To Hub**

[More information is here](../IrScrutinizer/README.md)

## Things to keep in mind

- Blobs are unavailable while the Sofabaton app is connected to the hub through
  the proxy.
- Fetch relies on the Sofabaton Control Panel card cache, so enable persistent cache and keep the
  cached device/command data current.
- Not every valid blob will be human-readable.
- A command id is not the blob itself; it is just the reference to that stored
  payload.
- Test first, then save.
- Only test and save **IR** blobs.

## Related docs

- Backup and restore: [backup.md](./backup.md)
- Command payload reference: [command_payloads.md](./command_payloads.md)
