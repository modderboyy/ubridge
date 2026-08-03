import { startRelayServer } from "../../packages/relay/dist/index.js";
import { UBridge } from "../../packages/client/dist/index.js";
import { NodeWebSocketTransport } from "../../packages/node/dist/index.js";

const relay = await startRelayServer(8787);
console.log(`[relay] ${relay.url}`);

const bobTransport = new NodeWebSocketTransport(relay.url);
const bob = await UBridge.connect({ identity: { userId: "ub_bob", deviceId: "bob_laptop" }, transport: bobTransport });
bob.onMessage((packet) => console.log("[bob] received", packet.payload));

const aliceTransport = new NodeWebSocketTransport(relay.url);
const alice = await UBridge.connect({ identity: { userId: "ub_alice", deviceId: "alice_laptop" }, transport: aliceTransport });
alice.onMessage((packet) => console.log("[alice] received", packet.payload));

await new Promise((r) => setTimeout(r, 150));
await alice.send("ub_bob", "Salom Bob, this is a real UBridge relay test.");
await new Promise((r) => setTimeout(r, 300));

await alice.close();
await bob.close();
await relay.close();
console.log("[demo] done");
