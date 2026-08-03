# UBridge

**UBridge** is a secure realtime network runtime for UFlow-class apps: messaging, presence, file transfer, voice/video signaling, multiplayer channels, sync and AI-agent communication.

The project starts with a platform-neutral TypeScript protocol core. It is not a Node-only library: the first packages are designed to work in Browsers, Cloudflare Workers, Deno, Bun and Node.js, then to be reimplemented in Dart/Flutter, Rust, Go, Swift and C# from the protocol RFC.

## Goals

- End-to-end encrypted packets by default.
- Direct P2P when possible, relay when necessary, queue when offline.
- Small SDK API: `bridge.send(userId, message)` and `bridge.voice.call(userId)`.
- Protocol-first architecture so other languages can implement it.
- Extremely cheap realtime: presence and signaling in edge runtimes, persistent history encrypted elsewhere.

## Packages

```text
packages/core       Packet format, IDs, errors, serialization, utilities
packages/crypto     WebCrypto-based key, encrypt, decrypt, sign abstractions
packages/protocol   Handshake, discovery, presence, file, voice and recovery models
packages/transport  WebSocket, WebRTC/relay abstractions
packages/client     Developer-facing UBridge client
packages/browser    Browser adapter
packages/node       Node adapter
packages/relay      Cloudflare Worker/Durable Objects relay skeleton
```

## Example

```ts
import { UBridge } from "@ubridge/client";

const bridge = await UBridge.connect({
  identity: { userId: "ub_alice", deviceId: "dev_1" },
  transport: myTransport,
});

await bridge.send("ub_bob", { type: "text", text: "Salom" });
```

## Protocol docs

See [`docs/rfcs/0001-protocol-v1.md`](docs/rfcs/0001-protocol-v1.md).

## Status

Early architecture and SDK skeleton. The protocol is intentionally explicit and conservative so it can grow into voice, video, file transfer and sync without becoming a messenger-only stack.
