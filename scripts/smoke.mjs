import {fixtureSpeaker} from '../test/fixtures/speaker.js';
import {CONTROLLERS} from '../src/cognitive/registry.js';
import {simulate} from '../src/sim/runner.js';
const speaker=fixtureSpeaker();const phrase=process.argv[2]||'aia';
for(const name of Object.keys(CONTROLLERS)){
 const result=simulate(name,phrase,speaker);
 console.log(`${name.padEnd(8)} frames=${result.frames.length} RMS=${result.metrics.normalizedTrackingRMS.toFixed(4)} effort=${result.metrics.effortMean.toFixed(2)} length=${result.metrics.normalizedPathLength.toFixed(2)}`);
}
