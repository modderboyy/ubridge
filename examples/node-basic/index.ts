import { UBridge } from "@ubridge/client";

const fakeTransport = {
  state: "open" as const,
  async open() {},
  close() {},
  async send(packet: unknown) { console.log("send", packet); },
  onPacket() { return () => {}; },
};

const bridge = await UBridge.connect({ identity: { userId: "ub_alice" }, transport: fakeTransport });
await bridge.send("ub_bob", "Salom");
