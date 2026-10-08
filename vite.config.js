import { defineConfig, loadEnv } from 'vite';
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
        .filter(f => f !== 'sw.js' && f !== 'ads.txt' && !f.endsWith('.map'))
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

// Writes dist/ads.txt for Google AdSense when a publisher ID is configured.
// It has to end up at the root of the domain (example.com/ads.txt).
function adsTxt(client) {
  return {
    name: 'miners-ads-txt',
    apply: 'build',
    generateBundle() {
      if (!client) return;
      if (!/^ca-pub-\d{10,20}$/.test(client)) {
        this.warn(`VITE_ADSENSE_CLIENT "${client}" should look like ca-pub-1234567890123456 - no ads.txt written`);
        return;
      }
      const publisher = client.replace(/^ca-/, '');
      this.emitFile({
        type: 'asset',
        fileName: 'ads.txt',
        source: `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    server: { port: 5173, strictPort: true },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 2500,
      assetsInlineLimit: 0
    },
    plugins: [adsTxt(env.VITE_ADS === 'off' ? '' : env.VITE_ADSENSE_CLIENT), serviceWorker()]
  };
});
