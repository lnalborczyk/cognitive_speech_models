import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {areaCoordinates} from '../src/view/plot.js';
const file=s=>readFileSync(new URL('../'+s,import.meta.url),'utf8');
test('canvases resize inside central panel and preserve aspect ratio',()=>{
 const css=file('src/view/style.css');
 assert.match(css,/\.maincontent canvas\{[^}]*max-width:100%/);
 assert.match(css,/\.maincontent canvas\{[^}]*width:100%/);
 assert.match(css,/\.maincontent canvas\{[^}]*height:auto/);
 assert.match(css,/\.layout\{grid-template-columns:minmax\(250px,288px\) minmax\(0,1fr\)/);
});
test('area chart maps nonuniform tube lengths to physical distance',()=>{
 const xs=areaCoordinates([1,3,2],3);
 assert.ok(Math.abs(xs[0]-1/12)<1e-8);
 assert.ok(Math.abs(xs[1]-2.5/6)<1e-8);
 assert.ok(Math.abs(xs[2]-5/6)<1e-8);
 assert.deepEqual(areaCoordinates(null,2),[.25,.75]);
});
