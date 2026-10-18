import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONTROLLERS} from '../src/cognitive/registry.js';
import {simulate} from '../src/sim/runner.js';
import {fixtureSpeaker} from './fixtures/speaker.js';
test('the public controller registry exposes exactly two models',()=>{
 assert.deepEqual(Object.keys(CONTROLLERS),['diva','td']);
 assert.equal(fs.existsSync('src/cognitive/godiva.js'),false);
 assert.equal(fs.existsSync('src/cognitive/geppeto-ofc.js'),false);
 const html=fs.readFileSync('index.html','utf8');
 assert.equal(html.includes('value="godiva"'),false);
 assert.equal(html.includes('value="geppeto-ofc"'),false);
});
test('unperturbed feedback is off by default',()=>{
 const s=simulate('diva','aia',fixtureSpeaker(),{noise:0});
 assert.equal(s.cfg.feedback,0);
});
test('new public scientific controls are accessible',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const id of ['sweep-test','calibration-test','feedback-test','experiment'])
   assert.match(html,new RegExp(`id="${id}"`));
});
