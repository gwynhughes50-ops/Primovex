import fs from 'node:fs';
import path from 'node:path';

const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY;
const repo = process.env.PRIMOVEX_RELEASE_REPOSITORY || 'gwynhughes50-ops/Primovex';
if (!publicKey) throw new Error('TAURI_UPDATER_PUBLIC_KEY is required to create signed release configuration.');

const config = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`],
      windows: { installMode: 'passive' }
    },
    'deep-link': {
      desktop: { schemes: ['primovex'] },
      mobile: [{ scheme: ['primovex'], appLink: false }]
    }
  }
};

const output = path.join(process.cwd(), 'src-tauri', 'tauri.release.conf.json');
fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Created ${output}`);
