# Networking guide

This integration acts as a proxy between your Sofabaton hub(s) and the official app. The network path is split in two segments so you can size firewall rules and container interfaces correctly.

## Segment 1 – Hub ↔ Integration

The integration discovers the physical hub and then keeps a bidirectional session open.

### Discovery
- Uses mDNS/Bonjour for the `_x1hub._udp.local.` advertisement to learn the hub IP/UDP port.
- If hubs sit on a different VLAN, multicast must be forwarded or you need to add the hub manually in the config flow (IP + UDP port).

### Connect flow
1. **CALL_ME over UDP**: Home Assistant sends a short "call me" packet to the hub's advertised UDP port (usually `8102`).
2. **TCP connect-back**: The hub opens a TCP session back to Home Assistant on the proxy's listen port. The integration tries up to 32 sequential TCP ports starting from the configured base port, so multiple hubs can coexist without clashes.

### Firewall rules to allow
- mDNS/Bonjour from hub → Home Assistant (or mDNS forwarded across VLANs).
- UDP from Home Assistant → hub on the Sofabaton UDP port (`8102` by default).
- TCP from hub → Home Assistant on the proxy listen range (the configured base port plus up to 31 additional ports for other hubs).

If discovery works but the integration never shows the hub as connected, the TCP connect-back from the hub to Home Assistant is usually being blocked.

## Segment 2 – Integration ↔ Official app (proxy)

The integration advertises a virtual `_x1hub._udp.local.` instance so the official app can talk to the proxy instead of the physical hub.

### Discovery (app side)
Two discovery mechanisms run in parallel:

1. **iOS-specific (UDP broadcast):**
   - The app sends a UDP broadcast to listeners on port **8102**.
   - The integration responds with its own UDP broadcast on port **8100** so the app learns the proxy details.
2. **Cross-platform (mDNS/Bonjour):**
   - For Android and other platforms, the app uses mDNS to find the advertised `_x1hub._udp.local.` proxy record.

Keep the proxy UDP listener on **8102** to satisfy the iOS discovery flow. Android can discover on other ports, but iOS discovery is lost if you move away from 8102.

### Connect flow (app side)
1. **CALL_ME from app → proxy (UDP):** all platforms send a call-me packet to the proxy listener once discovery completes. iOS uses broadcast; Android can use unicast.
2. **TCP connect-back from proxy → app:** after the call-me, the proxy opens a TCP connection into the app on a port in the **8100–8110** range that the app exposes.
3. **Relay to the real hub:** once the TCP session is up, the proxy bridges app commands to the already-established hub connection.

When the app is connected, command-sending entities in Home Assistant intentionally become unavailable to avoid conflicting control writers.

### Firewall and container tips
- Allow UDP from the app network/VLAN to Home Assistant on the proxy UDP port (ideally 8102 for iOS support). The proxy must be able to send and receive both unicast and **broadcast** UDP on that port for iOS discovery.
- Allow TCP **outbound from Home Assistant to the app** on the port range **8100–8110**. This directionality is important: the proxy calls back into the app after the call-me, not the other way around.
- Allow the app to use UDP (unicast and broadcast) and TCP within **8100–8110** toward Home Assistant so it can send the call-me and handle the connect-back. Broadcast is only required for iOS compatibility.
- If Home Assistant runs in a container, bind the proxy UDP/TCP ports to the host interfaces that your mobile devices can reach.

## Multiple hubs and VLANs checklist
- Ensure each hub's mDNS traffic reaches Home Assistant (multicast forwarding or manual configuration).
- Reserve a contiguous TCP port range large enough for your hubs (base port + up to 31). Avoid collisions with other services on the host.
- If you split hubs and apps across VLANs, permit the UDP advertisement/handshake paths in both directions and the TCP connect-back from each hub.
- Keep the proxy UDP listener on 8102 whenever iOS discovery is required.

## Troubleshooting
- **Seen in discovery but never connects:** likely missing TCP allow rule from hub to Home Assistant.
- **No discovery across VLANs:** forward mDNS or configure the hub manually.
- **App cannot find the proxy:** confirm the proxy UDP port is reachable (and set to 8102 for iOS).
- **Port already in use:** pick a different TCP base port; the integration will try the next 31 ports automatically.
