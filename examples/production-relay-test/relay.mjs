import { startRelayServer } from "../../packages/relay/dist/index.js";
const server = await startRelayServer(Number(process.env.PORT || 8787));
console.log(`[relay] listening ${server.url}`);
process.on("SIGINT", async () => { await server.close(); process.exit(0); });
