import { getModel, type Model } from "@earendil-works/pi-ai";
import { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import type { ModelSpec } from "./types.js";

export interface ResolvedModel {
  model: Model<any>;
  modelRegistry: ModelRegistry;
}

export function resolveModel(spec: ModelSpec, authStorage: AuthStorage): ResolvedModel {
  // Always create a full registry so ~/.pi/agent/models.json is loaded.
  // This covers anthropic/openai built-ins as well as any custom providers
  // (lmstudio-tw, ollama, etc.) the user has configured globally.
  const registry = ModelRegistry.create(authStorage);

  const fromRegistry = registry.find(spec.provider, spec.model);
  if (fromRegistry) {
    return { model: fromRegistry, modelRegistry: registry };
  }

  // Not in the registry -- try getModel() for the two built-in providers.
  if (spec.provider === "anthropic" || spec.provider === "openai") {
    return {
      model: getModel(spec.provider as any, spec.model as any),
      modelRegistry: registry,
    };
  }

  // Unknown provider with no entry in models.json -- fall back to inline spec.
  if (!spec.baseUrl) {
    throw new Error(
      `Provider "${spec.provider}" model "${spec.model}" was not found in ~/.pi/agent/models.json ` +
      `and no baseUrl was supplied in the scenario spec.`
    );
  }

  registry.registerProvider(spec.provider, {
    name: spec.provider,
    baseUrl: spec.baseUrl,
    api: "openai-completions",
    models: [
      {
        id: spec.model,
        name: spec.model,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: spec.contextWindow ?? 32768,
        maxTokens: spec.maxTokens ?? 4096,
      },
    ],
  });

  const model = registry.find(spec.provider, spec.model);
  if (!model) {
    throw new Error(`Failed to register model ${spec.provider}/${spec.model}`);
  }

  return { model, modelRegistry: registry };
}
