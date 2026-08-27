import riskCategoryCatalog from "../../docs/gateway/canonical-risk-category-catalog.json";

const labels = Object.fromEntries(
  riskCategoryCatalog.categories.map((category) => [category.code, category.labelZh]),
) as Record<string, string>;

export function riskCategoryLabel(code: string) {
  return labels[code] || code;
}
