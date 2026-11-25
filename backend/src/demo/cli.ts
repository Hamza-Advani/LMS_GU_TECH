/** Local DEMO database tools. `npm run seed:demo` (idempotent upsert) / `npm run reset:demo` (wipe local demo file, reseed). */
import { getStore, demoDir } from './index.js';

const cmd = process.argv[2];
const s = getStore();
if (cmd === 'reset') { console.log('Demo database reset. Created:', s.reset()); }
else if (cmd === 'seed') { console.log('Demo data upserted (stable ids, no duplicates). Rows:', s.seed()); }
else { console.error('Usage: tsx src/demo/cli.ts seed|reset'); process.exit(1); }
console.log(`Demo data file: ${demoDir}`);
