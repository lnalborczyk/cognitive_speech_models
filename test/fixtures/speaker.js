/** Synthetic *VTL API metadata fixture* used exclusively for controller tests.
 * No anatomical, biomechanical or acoustic simulation is implemented here.
 * The application does not import this module.
 */
export function fixtureSpeaker() {
  const names=['JX','JA','TCX','TCY','TTX','TTY','LP','LD'];
  const targets={
    a:[.45,.72,.53,.30,.56,.31,.35,.70],
    i:[.40,.35,.76,.82,.74,.79,.30,.25],
    u:[.35,.25,.28,.70,.37,.65,.82,.20],
    p:[.43,.35,.50,.45,.55,.52,.60,.02],
    t:[.42,.45,.53,.50,.70,.91,.40,.37],
    k:[.41,.48,.27,.92,.33,.50,.43,.40],
    m:[.42,.36,.52,.43,.57,.50,.49,.03],
  };
  return {
    kind:'vtl',isNative:true,engine:'mock VTL metadata (unit tests only)',
    names,labels:names,
    min:Array(names.length).fill(0),max:Array(names.length).fill(1),
    neutral:[.4,.45,.5,.5,.5,.5,.5,.45],
    shapes:targets,rate:44100,
  };
}
