import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const unexpected = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) unexpected.push(path);
  }
}

await walk(fileURLToPath(new URL('../src', import.meta.url)));
await walk(fileURLToPath(new URL('../tests', import.meta.url)));
if (unexpected.length) {
  console.error('Generated JavaScript was found beside TypeScript sources. Remove these files before building:');
  unexpected.forEach((path) => console.error(`- ${path}`));
  process.exit(1);
}
