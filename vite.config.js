import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function listFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// Writes dist/sw.js with every built file in the precache list, so the game
// works offline once it has been opened.
function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'miners-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map(f => relative(outDir, f).split(sep).join('/'))
        .filter(f => f !== 'sw.js' && !f.endsWith('.map'))
        // only precache latin font subsets, others load on demand
        .filter(f => !/\.woff2?$/.test(f) || (/-latin-(ext-)?\d+-normal/.test(f) && f.endsWith('.woff2')));
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync('src/sw-template.js', 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files], null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    }
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    assetsInlineLimit: 0
  },
  plugins: [serviceWorker()]
});
