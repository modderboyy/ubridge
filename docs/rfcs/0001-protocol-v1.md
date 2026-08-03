# RFC 0001 — UBridge Protocol v1

## Packet

```json
{
  "header": {
    "version": 1,
    "kind": "message",
    "id": "pkt_xxx",
    "from": "ub_alice",
    "to": "ub_bob",
    "timestamp": 1720000000000,
    "route": "direct"
  },
  "payload": {
    "alg": "AES-GCM",
    "keyId": "session_xxx",
    "nonce": "...",
    "ciphertext": "..."
  },
  "signature": "..."
}
```

## Kinds

- `hello` — client capability announcement.
- `handshake` — session establishment.
- `message` — encrypted application message.
- `presence` — ephemeral status.
- `ack` — received/delivered/read acknowledgement.
- `file` — file offer and chunks.
- `voice` / `video` — call signaling.
- `sync` — collaborative state sync.
- `error` — protocol error.

## Routing

The client chooses direct, relay or queue after discovery. Payload encryption happens before routing.
