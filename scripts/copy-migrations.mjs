import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(projectRoot, 'src', 'infrastructure', 'persistence', 'migrations');
const destinationDir = path.join(projectRoot, 'dist', 'infrastructure', 'persistence', 'migrations');

if (!fs.existsSync(sourceDir)) {
  console.error(`Migrations source directory not found: ${sourceDir}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
fs.cpSync(sourceDir, destinationDir, { recursive: true });
console.log(`Copied SQL migrations to ${path.relative(projectRoot, destinationDir)}`);
