#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = spawnSync("npx", ["tsx", path.resolve(__dirname, '../index.ts'), ...args], {
	stdio: "inherit",
});

process.exit(result.status);
