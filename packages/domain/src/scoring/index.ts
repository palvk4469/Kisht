import type { ModelParams } from "./model.ts";
import modelV1 from "./model-v1.json" with { type: "json" };

export * from "./backtest.ts";
export * from "./features.ts";
export * from "./model.ts";
export * from "./train.ts";

/** The model in production. Retrain with: pnpm --filter @kisht/db model:train */
export const CURRENT_MODEL: ModelParams = modelV1;
