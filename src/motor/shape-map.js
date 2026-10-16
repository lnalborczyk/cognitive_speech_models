/** Names of VTL speaker-defined *articulatory targets*, not phoneme audio samples.
 * JD3 stores stops as context-specific constriction shapes, not as "p", "t", "k".
 * Other speakers may lack these shapes; missing targets are never fabricated.
 */
export const STOP_SHAPES = Object.freeze({
  p: 'll-labial-closure',
  t: 'tt-alveolar-closure',
  k: 'tb-velar-closure',
});
export const VOWEL_CONTEXTS = ['a','i','u'];
export function candidateShapes(phone) {
  if (!STOP_SHAPES[phone]) return [phone];
  return VOWEL_CONTEXTS.map(v => `${STOP_SHAPES[phone]}(${v})`);
}
export function resolvedShape(speaker,phone,context='a') {
  const ctx = `${phone}:${context}`;
  if (speaker.shapes[ctx]) return {target:speaker.shapes[ctx],source:speaker.shapeSources?.[ctx]||ctx};
  if (speaker.shapes[phone]) return {target:speaker.shapes[phone],source:speaker.shapeSources?.[phone]||phone};
  return null;
}
