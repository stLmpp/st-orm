import { DenonConfig } from 'https://deno.land/x/denon/mod.ts';

const config: DenonConfig = {
  scripts: {
    start: {
      cmd: 'dist/bundle.js',
    },
  },
  watcher: {
    match: ['dist/bundle.js'],
  },
  logger: {
    fullscreen: true,
  },
  allow: ['read', 'net'],
  unstable: true,
};

// run --allow-read --allow-net --config tsconfig.deno.json --importmap=import_map.json --unstable

export default config;
