const runtimeEnv = import.meta.env;

export const PRODUCT_FEATURES = Object.freeze({
  externalModelStatus: true,
  modelComparison: runtimeEnv?.VITE_FEATURE_MODEL_COMPARISON === "true",
  deepAnalysis: runtimeEnv?.VITE_FEATURE_DEEP_ANALYSIS === "true",
});
