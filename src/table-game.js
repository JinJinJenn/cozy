// Moves are board squares in play order. Buoys go first, then life rings.
export const boardX = -.21;
export const squareSize = .21;
export const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export function winningLine(moves) {
  for (const line of lines) {
    const first = moves.indexOf(String(line[0]));
    if (first < 0) continue;
    if (line.every(square => {
      const turn = moves.indexOf(String(square));
      return turn >= 0 && turn % 2 === first % 2;
    })) return line;
  }
  return null;
}
export const finished = moves => moves.length === 9 || !!winningLine(moves);
export function validRound(round, actor) {
  return actor.activity === 'tablegame' && typeof actor.using?.lot === 'string' &&
    typeof round?.id === 'string' && round.id.length <= 64 && Number.isFinite(round.at) &&
    Array.isArray(round.players) && round.players.length === 2 && round.players[0] === actor.id &&
    (round.players[1] === null || typeof round.players[1] === 'string' && round.players[1] !== actor.id) &&
    typeof round.moves === 'string' && /^[0-8]{0,9}$/.test(round.moves) &&
    new Set(round.moves).size === round.moves.length && !winningLine(round.moves.slice(0,-1));
}

export function roundAt(session, lot) {
  for (const actor of session.actors.values()) {
    if (actor.activity === 'tablegame' && actor.using?.lot === lot && actor.tableRound) return actor.tableRound;
  }
  return null;
}
function opponent(session, actor) {
  for (const other of session.actors.values()) {
    if (other !== actor && other.activity === 'tablegame' && other.using?.lot === actor.using.lot) return other;
  }
}
function start(session, first, second) {
  delete first.tableRound;
  if (second) delete second.tableRound;
  first.tableRound = {id: crypto.randomUUID(), players: [first.id, second?.id ?? null], moves: '', at: session.time};
}
export function sitAtBoard(session, actor) {
  const seated = opponent(session, actor);
  if (seated && !seated.tableRound) start(session, seated, actor);
}
export function leaveBoard(session, actor) {
  const other = opponent(session, actor);
  if (other?.tableRound?.players.includes(actor.id)) delete other.tableRound;
  delete actor.tableRound;
}
function place(session, round, cell, player) {
  round.moves += String(cell);
  round.at = session.time;
  if (player) player.using.playedAt = session.time;
}
export function boardCommand(session, actor, cmd) {
  if (actor.activity !== 'tablegame' || !actor.using || actor.using.lot !== cmd.lot) return;
  const round = roundAt(session, cmd.lot);
  if ((round?.id ?? null) !== cmd.round || (round?.moves.length ?? 0) !== cmd.ply) return;
  const other = opponent(session, actor);
  if (cmd.choice === 'solo') {
    if (!other && (!round || finished(round.moves))) start(session, actor);
  } else if (cmd.choice === 'together') {
    if (other && (!round || finished(round.moves) || round.players[1] === null && round.players[0] === actor.id)) {
      const first = round?.players[0] === actor.id ? other : actor;
      start(session, first, first === actor ? other : actor);
    }
  } else if (cmd.choice === 'place' && round && !finished(round.moves) &&
      round.players[round.moves.length % 2] === actor.id && Number.isInteger(cmd.cell) &&
      cmd.cell >= 0 && cmd.cell < 9 && !round.moves.includes(String(cmd.cell))) {
    place(session, round, cmd.cell, actor);
  }
}
export function practiceTurn(session, round) {
  const moves = round.moves;
  if (round.players[1] !== null || moves.length % 2 !== 1 || session.time - round.at < .65 || finished(moves)) return;
  const free = [4,0,8,2,6,1,3,5,7].filter(cell => !moves.includes(String(cell)));
  const own = [...moves].filter((_, i) => i % 2 === 1);
  const theirs = [...moves].filter((_, i) => i % 2 === 0);
  const completes = (cell, tokens) => lines.some(line => line.includes(cell) &&
    line.every(square => square === cell || tokens.includes(String(square))));
  const cell = free.find(cell => completes(cell, own)) ?? free.find(cell => completes(cell, theirs)) ?? free[0];
  place(session, round, cell);
}
