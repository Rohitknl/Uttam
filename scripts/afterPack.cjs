const fs = require('fs');
const path = require('path');

const SKIP_MODULES = new Set([
  'prisma',
  '.bin',
  '.cache',
]);

function copyDirFiltered(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_MODULES.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(from, to, { recursive: true, force: true });
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * electron-builder honors .gitignore and skips node_modules in extraResources.
 * Copy backend runtime deps after pack so the offline API can start.
 * Skip the Prisma CLI package (not needed at runtime; locks OneDrive/7zip).
 */
exports.default = async function afterPack(context) {
  const root = path.join(__dirname, '..');
  const resources = path.join(context.appOutDir, 'resources');
  const backendDest = path.join(resources, 'backend');
  const modulesSrc = path.join(root, 'backend', 'node_modules');
  const modulesDest = path.join(backendDest, 'node_modules');
  const templateSrc = path.join(root, 'backend', 'prisma', 'template.db');
  const templateDest = path.join(backendDest, 'prisma', 'template.db');

  if (!fs.existsSync(modulesSrc)) {
    throw new Error(`Missing backend node_modules at ${modulesSrc}`);
  }

  console.log(`afterPack: copying backend runtime node_modules -> ${modulesDest}`);
  if (fs.existsSync(modulesDest)) {
    fs.rmSync(modulesDest, { recursive: true, force: true });
  }
  copyDirFiltered(modulesSrc, modulesDest);

  if (fs.existsSync(templateSrc)) {
    fs.mkdirSync(path.dirname(templateDest), { recursive: true });
    fs.copyFileSync(templateSrc, templateDest);
    console.log('afterPack: copied template.db');
  }

  const engine = path.join(modulesDest, '.prisma', 'client', 'query_engine-windows.dll.node');
  if (!fs.existsSync(engine)) {
    throw new Error(`Prisma Windows engine missing after copy: ${engine}`);
  }
  console.log('afterPack: Prisma engine present');
};
