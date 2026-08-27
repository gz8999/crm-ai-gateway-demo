import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const assetsDir = path.resolve("dist/assets");
const forbidden = [
  "Raw CRM Data",
  "Run Gateway Transform",
  "AI Function Buttons",
  "supplier_cost",
  "contract_text",
  "InternalAiLab",
  "internal/ai-lab",
];

const files = await readdir(assetsDir);
for (const file of files) {
  const content = await readFile(path.join(assetsDir, file), "utf8");
  const match = forbidden.find((marker) => content.includes(marker));
  if (match) throw new Error(`Production bundle contains DEV-only marker ${JSON.stringify(match)} in ${file}`);
}

console.log(`Production bundle isolation verified across ${files.length} assets.`);
