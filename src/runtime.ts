import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setMagnusRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getMagnusRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Magnus runtime not initialized");
  }
  return runtime;
}
