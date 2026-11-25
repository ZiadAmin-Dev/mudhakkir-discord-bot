/*
adhan@4.4.6 publishes its development tsconfig files but not the src/ and test/
folders they include. Tools that scan every tsconfig.json then report TS18003
("No inputs were found"). Those files are never used by consumers: the package
exposes lib/types/Adhan.d.ts through its "types" field. Removing them after
install keeps the dependency tree clean without touching runtime or types.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adhanDir = path.join(projectRoot, 'node_modules', 'adhan');

if (fs.existsSync(adhanDir)) {
  for (const file of ['tsconfig.json', 'tsconfig.types.json']) {
    const target = path.join(adhanDir, file);
    if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
  }
}
