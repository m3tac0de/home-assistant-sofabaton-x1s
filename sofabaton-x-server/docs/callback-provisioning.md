# Optional callback provisioning example

The general [integration guide](first-integration.md) consumes Wifi Devices
configured in the panel. This separate example creates or reuses the
legacy HTTP callback device under key `default`. The current
[Hubitat example](../examples/hubitat/README.md) requires that record and
ignores other keyed Wifi Devices, including those added through the panel.

Use this only for that example or when deliberately exploring the
configuration APIs. Keep provisioning separate from normal client startup.

## Provision the legacy device

Register the hub in the panel, close the official app, and choose an
existing activity and physical button. The command below **replaces both
the short and long assignments of PLAY in activity 101**. Choose a button
you intend to reassign and substitute your own server and hub IDs.

The script writes hub configuration. If access is set up on the server
(`auth.claimed` in `GET /api/v1/server`), make a token in the control
panel under **Server settings → Access** and put it in `SOFABATON_TOKEN`;
the script sends it on every request as `Authorization: Bearer sbx_...`.
Without it, the first write fails with `401 auth_required`. Before
access is set up, no token is needed.

From the repository root, with Python 3.11+:

```sh
export SOFABATON_TOKEN=sbx_...   # only once access is set up
python sofabaton-x-server/examples/provision_callback.py --server http://192.168.1.10:8480 --hub-id e26a44861b45 --activity 101 --button PLAY
```

In PowerShell, set `$env:SOFABATON_TOKEN = "sbx_..."` instead of `export`.
The example handles the server's token; it does not implement separate
reverse-proxy authentication. It refuses configuration changes when the
hub reports unsupported firmware; update the hub before running it again.

The script uses the adjacent `starter.py` for HTTP requests. It reads the
activity list before writing, creates `default` if missing or reuses its
first slot and existing labels, and binds commands 1 and 11 to the chosen
button. A keyed Wifi Device created in the panel is a different record;
this command does not select or convert it.

Configuration writes return jobs. The script waits for each job to finish
before the next write and reports failure without automatically retrying.
`202 Accepted` means the job started; only job status `done` means it
succeeded. If setup fails, inspect the reported job and hub state before
trying again: earlier steps may already have changed the hub.

## Test a press

The hub must reach the server's HTTP callback listener on TCP **8060** by
default; X1 always uses that port. The client uses the API/WebSocket port,
normally **8480**. Confirm the deployed destination printed by the script
is reachable from the hub, and allow the physical remote to synchronize.

Use the [starter listener](first-integration.md#optional-runnable-python-example)
with the same server and hub, select the activity on the physical remote,
then press the assigned button. A new deployment labels its first slot
`Demo`; a short press has command ID 1 and a long press has command ID 11.
The event's `device_key` is `default`.

For Hubitat, return to its [button setup instructions](../examples/hubitat/README.md#4-make-the-remote-trigger-hubitat)
and reload the selected hubs so the app reads the new record.

If no press arrives, check the button assignment, active activity, remote
synchronization, deployed destination and callback listener. Another
service may already own port 8060. See the
[callback API reference](api-reference.md#button-events) for stale records,
jobs, listener state and recovery.
