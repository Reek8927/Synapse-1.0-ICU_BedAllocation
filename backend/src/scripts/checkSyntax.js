import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '../..');
const scanRoots = ['src', 'test'];
const files = [];

function collectJavaScript(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(fullPath);
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(fullPath);
  }
}

for (const relativeRoot of scanRoots) collectJavaScript(path.join(backendRoot, relativeRoot));
files.sort();

if (!files.length) {
  console.error('No JavaScript source or test files were found.');
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`Syntax check failed: ${path.relative(backendRoot, file)}`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
  }
}

if (failures) {
  console.error(`JavaScript syntax check failed for ${failures} of ${files.length} files.`);
  process.exit(1);
}

console.log(`JavaScript syntax check passed for ${files.length} source and test files.`);
