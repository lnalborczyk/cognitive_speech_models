/** Place-specific VTL constriction diagnostics for the main simulation view.
 *
 * Diagnostic tube samples (normally ~100 Hz) must be preferred to the SVG
 * animation's much sparser geometry. Reference tubes are taken from the
 * actual VTL consonant target, not from the minimum area elsewhere.
 * These remain geometric criteria; they are not perceptual phoneme labels.
 */
import {analyzeStops,placeSpecificSeries} from './closure-analysis.js';

export function buildClosureDiagnostics(simulation, response) {
  const samples = Array.isArray(response?.diagnosticGeometry) && response.diagnosticGeometry.length
    ? response.diagnosticGeometry
    : (Array.isArray(response?.geometry) ? response.geometry : []);
  const references = Array.isArray(response?.references) ? response.references : [];
  const stops = analyzeStops(simulation, samples, references);
  const series = stops.map(stop => {
    const reference = references.find(r => r.phone === stop.phone && r.context === stop.context);
    return {
      phone: stop.phone,
      context: stop.context,
      series: placeSpecificSeries(samples, reference, stop.phone),
    };
  });
  const report = stops.length ? stops.map(stop => {
    const place = stop.sitePosition === null ? 'unknown place' : `${(100 * stop.sitePosition).toFixed(0)}% of tract`;
    const minimum = stop.minimumArea_cm2 === null ? 'n/a' : `${stop.minimumArea_cm2.toFixed(3)} cm²`;
    const hold = stop.closureDuration_s === null ? 'n/a' : `${Math.round(1000 * stop.closureDuration_s)} ms`;
    const release = stop.releaseTime_s === null ? 'not detected' : `${stop.releaseTime_s.toFixed(3)} s`;
    return `/${stop.phone}/ at ${place}: minimum ${minimum}; longest hold ${hold}; release ${release}; ${stop.status}`;
  }).join(' · ') : 'Vowel-only sequence; no stop closure targets.';
  return {stops, series, report};
}
