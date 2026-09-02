import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/orama-entry.js'],
  outfile: 'js/vendor/orama.browser.js',
  bundle: true,
  format: 'iife',
  globalName: 'ZeroChatOrama',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none'
});
