/**
 * Compiles the Solidity contracts with solc and writes ABI + bytecode to
 * contracts/artifacts.json (consumed by deploy.ts and the agents).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(`${root}/${p}`, "utf-8");

const input = {
  language: "Solidity",
  sources: {
    "TruthOracle.sol": { content: read("contracts/TruthOracle.sol") },
    "ParametricPool.sol": { content: read("contracts/ParametricPool.sol") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of output.errors ?? []) console.warn(w.formattedMessage);

const artifacts: Record<string, { abi: unknown; bytecode: string }> = {};
for (const [file, contracts] of Object.entries(output.contracts) as [string, Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>][]) {
  for (const [name, c] of Object.entries(contracts)) {
    artifacts[name] = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
    console.log(`compiled ${name} (${file})`);
  }
}

writeFileSync(`${root}/contracts/artifacts.json`, JSON.stringify(artifacts, null, 2));
console.log("→ contracts/artifacts.json");
