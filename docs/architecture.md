# UBridge Architecture

UBridge is split into protocol, crypto, client API and transports. Persistent storage is intentionally outside the core: apps may use Supabase, Postgres, SQLite, Cloudflare R2 or any other encrypted store.

## Transport order

1. Direct P2P — WebRTC/QUIC when possible.
2. Trusted node — optional community/device relay.
3. UFlow relay — encrypted packet forwarding.
4. Queue — encrypted offline packet until peer returns.

## Server visibility

Relays see routing metadata and packet sizes. Payloads are encrypted and signed by devices.
