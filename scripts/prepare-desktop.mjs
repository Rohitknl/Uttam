import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const templateDb = path.join(backend, 'prisma', 'template.db');

function run(command, args, cwd, extraEnv = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('Building frontend...');
run('npm', ['run', 'build'], frontend);

console.log('Generating Prisma client...');
run('npx', ['prisma', 'generate'], backend);

const devDb = path.join(backend, 'prisma', 'dev.db');

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const p = `${templateDb}${suffix}`;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

if (fs.existsSync(devDb)) {
  console.log('Copying working dev.db to template.db so exact database state is shipped with Electron...');
  fs.copyFileSync(devDb, templateDb);
} else {
  console.log('Preparing SQLite template database...');
  const templateUrl = 'file:./template.db';
  run('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], backend, {
    DATABASE_URL: templateUrl,
  });
  run('node', ['seeds/clean.js'], backend, {
    DATABASE_URL: templateUrl,
  });
}

if (!fs.existsSync(templateDb)) {
  console.error('Expected backend/prisma/template.db after prepare');
  process.exit(1);
}

console.log(`Template DB ready: ${templateDb}`);
console.log('Desktop prepare complete.');
