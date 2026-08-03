# Security Model

UBridge assumes the network and relays are untrusted.

- Private keys stay on the device.
- Discovery servers store public keys and routing hints only.
- Payloads are encrypted before transport selection.
- Packets are signed so relays cannot modify content silently.
- Offline queues store encrypted packets only.

The first implementation uses WebCrypto AES-GCM boxes. The protocol reserves space for X25519/Ed25519 and Double Ratchet style sessions.
