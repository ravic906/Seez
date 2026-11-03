// Callsigns for survivors. Random and anonymous: no real name is ever asked for or shown.
const ADJ = ['Lone', 'Silent', 'Drifting', 'Frozen', 'Distant', 'Hollow', 'Cosmic', 'Dusty', 'Faint', 'Last', 'Pale', 'Wandering'];
const NOUN = ['Comet', 'Probe', 'Pilot', 'Orbit', 'Nebula', 'Rover', 'Quasar', 'Meteor', 'Beacon', 'Signal', 'Lander', 'Satellite'];

export function randomHandle(rng = Math.random) {
  const a = ADJ[Math.floor(rng() * ADJ.length)];
  const n = NOUN[Math.floor(rng() * NOUN.length)];
  return `${a}${n}${10 + Math.floor(rng() * 90)}`;
}
