import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/dsh/index.ts'], outfile: 'dist/index.js', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external', sourcemap: false });
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external', banner: { js: '#!/usr/bin/env node' }, sourcemap: false });
console.log('Built DSH plugin and headless CLI. DSH services and Playwright remain external dependencies.');
