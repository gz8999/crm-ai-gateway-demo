import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateDecisionPortfolio } from "../server/decision/generatePortfolio.mjs";

const target = fileURLToPath(new URL("../server/data/decision-portfolio.json", import.meta.url));
await writeFile(target, `${JSON.stringify(generateDecisionPortfolio(), null, 2)}\n`, "utf8");
console.log(`Wrote deterministic decision portfolio to ${target}`);
