import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const build=readFileSync(new URL('../scripts/build_browser.sh',import.meta.url),'utf8');

test('Bash build script does not expand an empty array under macOS Bash 3.2',()=>{
  assert.doesNotMatch(build,/EXTRA\[@\]/);
  assert.match(build,/if \(\( DIAGNOSTIC \)\)/);
  assert.match(build,/--speaker "\$SPEAKER" --diagnostic/);
});
