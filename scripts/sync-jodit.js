/**
 * Copies Jodit's es2021.en build from node_modules into jodit/, which is
 * committed because ProcessWire modules are installed without a build step.
 *
 *   npm run sync-jodit    copy the files (after changing the jodit version)
 *   npm run check-jodit   fail if jodit/ doesn't match the installed package (CI)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgDir = path.join(root, 'node_modules', 'jodit');
const outDir = path.join(root, 'jodit');
const check = process.argv.includes('--check');

if (!fs.existsSync(pkgDir)) {
  console.error('node_modules/jodit is missing; run npm ci first');
  process.exit(1);
}

const version = require(path.join(pkgDir, 'package.json')).version;
const files = {
  'jodit.min.js': fs.readFileSync(path.join(pkgDir, 'es2021.en', 'jodit.min.js')),
  'jodit.min.css': fs.readFileSync(path.join(pkgDir, 'es2021.en', 'jodit.min.css')),
  'LICENSE.txt': fs.readFileSync(path.join(pkgDir, 'LICENSE.txt')),
  'VERSION': Buffer.from(`${version} (es2021.en build, from the jodit npm package)\n`),
};

const stale = Object.keys(files).filter((name) => {
  const file = path.join(outDir, name);
  return !fs.existsSync(file) || !fs.readFileSync(file).equals(files[name]);
});

if (check) {
  if (stale.length) {
    console.error(`jodit/ doesn't match jodit ${version} in package-lock.json: ${stale.join(', ')}`);
    console.error('Run npm run sync-jodit and commit the result.');
    process.exit(1);
  }
  console.log(`jodit/ matches jodit ${version}`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of Object.keys(files)) fs.writeFileSync(path.join(outDir, name), files[name]);
console.log(stale.length ? `jodit/ updated to ${version}: ${stale.join(', ')}` : `jodit/ already matches ${version}`);
