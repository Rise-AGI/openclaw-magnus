import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { magnusPlugin } from "./src/channel.js";
import { setMagnusRuntime } from "./src/runtime.js";

const plugin = {
  id: "openclaw-magnus",
  name: "Magnus",
  description: "Magnus platform chat channel via WebSocket",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setMagnusRuntime(api.runtime);
    api.registerChannel({ plugin: magnusPlugin });
    console.log("Magnus channel plugin registered");
  },
};

export default plugin;
export { magnusPlugin } from "./src/channel.js";
export type { MagnusConfig, MagnusAccountConfig, ResolvedMagnusAccount } from "./src/types.js";
