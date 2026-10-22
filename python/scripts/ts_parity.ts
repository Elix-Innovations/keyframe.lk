/**
 * TypeScript parity check: asserts web/src/lib/fm.ts and wijesekara.ts give
 * exactly the results in python/tests/golden.json (which the Python tests
 * also assert), so the browser and the Python service cannot drift apart.
 *
 *   server/node_modules/.bin/tsx python/scripts/ts_parity.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmToUnicode, unicodeToFM } from '../../web/src/lib/fm';
import { typeWijesekara, wijesekaraKey, WIJESEKARA_HINTS } from '../../web/src/lib/wijesekara';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, '..', 'tests', 'golden.json'), 'utf8')) as {
  unicodeToFM: [string, string][];
  fmToUnicode: [string, string][];
  wijesekara: [string, string][];
};

let fails = 0;
let checks = 0;
const eq = (what: string, got: string, want: string) => {
  checks++;
  if (got !== want) {
    fails++;
    console.error(`FAIL ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
};

for (const [u, fm] of golden.unicodeToFM) {
  eq(`unicodeToFM(${u})`, unicodeToFM(u), fm);
  eq(`fmToUnicode(${fm})`, fmToUnicode(fm), u);
}
for (const [fm, u] of golden.fmToUnicode) eq(`fmToUnicode(${fm})`, fmToUnicode(fm), u);
for (const [keys, want] of golden.wijesekara) eq(`wijesekara(${keys})`, typeWijesekara(keys), want);

// API shape the UI relies on
eq('wijesekaraKey(space)', String(wijesekaraKey('ක', ' ')), 'null');
eq('wijesekaraKey(ක,a)', JSON.stringify(wijesekaraKey('ක', 'a')), JSON.stringify({ deleteBack: 0, insert: '්' }));
eq('hints non-empty', String(WIJESEKARA_HINTS.length > 40), 'true');

console.log(`${checks - fails}/${checks} parity checks passed`);
process.exit(fails ? 1 : 0);
