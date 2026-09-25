// node tools/safemode_test.mjs — the all-ages guard blocks adult prompts and lets normal art through.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SafeMode = require('../src/renderer/safemode.js');
const blocked = ['a naked knight', 'NSFW art', 'sexy pose', 'nude beach', 'lingerie model', 'a woman in a bikini', 'deep cleavage', 'hentai style', 'R18 picture', 'explicit scene', 'a red bra'];
const allowed = ['a knight guarding a castle at dawn', 'fox spirit in a bamboo forest', 'a brass lamp on a desk', 'Sussex countryside', 'embrace of two old friends', 'a brave dragon', 'Middlesex library', 'striped scarf'];
let fail = 0;
for (const t of blocked) { try { SafeMode.check(t); console.log('FAIL (not blocked):', t); fail++; } catch { console.log('ok blocked:', t); } }
for (const t of allowed) { try { SafeMode.check(t); console.log('ok allowed:', t); } catch (e) { console.log('FAIL (blocked):', t, e.message); fail++; } }
console.log(`${blocked.length + allowed.length - fail}/${blocked.length + allowed.length} passed`);
process.exit(fail ? 1 : 0);
