import { build } from 'esbuild';

await build({
  entryPoints: ['src/vercel-api.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'api/index.js',
  packages: 'external',
  logLevel: 'info',
});
