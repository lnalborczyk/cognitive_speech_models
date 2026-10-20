import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const file=(path)=>readFileSync(new URL(path,root),'utf8');
test('app has only VTL backend options and VTL anatomy, no toy drawing',()=>{
 const html=file('index.html');
 assert.doesNotMatch(html,/value="preview"|id="tract"|id="tongue"/);
 assert.match(html,/id="native-geometry"/);
 assert.equal(existsSync(new URL('src/body/preview.js',root)),false);
});
test('app refuses to simulate without an initialized VTL speaker',()=>{
 const app=file('src/app.js');
 assert.match(app,/function requireVTL\(/);
 assert.match(app,/speaker\?\.kind!=='wasm'/);
 assert.doesNotMatch(app,/previewSpeaker|drawTract/);
});
