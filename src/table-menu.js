import {boardX,roundAt,squareSize,winningLine} from './table-game.js';
import {toRoom} from './street-world.js';

const $ = id => document.getElementById(id);
const tokens = ['buoy','life ring'];
const names = ['top left','top middle','top right','middle left','center','middle right','bottom left','bottom middle','bottom right'];
const version = (lot, round) => ({type:'table-game', lot, round:round?.id ?? null, ply:round?.moves.length ?? 0});

export function pickBoardSquare(ray, home, actor, session) {
  if (actor?.activity !== 'tablegame' || actor.using?.lot !== home?.id || ray.direction.y >= -.001) return null;
  const table = home.furniture.find(f => f.type === 'dining');
  if (!table) return null;
  const y = home.y+.94, distance = (y-ray.origin.y)/ray.direction.y;
  if (distance < 0) return null;
  const point = {x:ray.origin.x+ray.direction.x*distance,z:ray.origin.z+ray.direction.z*distance};
  const p = toRoom(home,point), angle = (table.turn || 0)*Math.PI/2;
  const dx = p.x-table.x, dz = p.z-table.z;
  const col = Math.floor((Math.cos(angle)*dx-Math.sin(angle)*dz-boardX)/squareSize+1.5);
  const row = Math.floor((Math.sin(angle)*dx+Math.cos(angle)*dz)/squareSize+1.5);
  if (row<0 || row>2 || col<0 || col>2) return null;
  const cell = row*3+col, round = roundAt(session,home.id), moves = round?.moves;
  const legal = round && round.players[moves.length%2]===actor.id && !moves.includes(String(cell)) && !winningLine(moves);
  return {point,y,command:legal?{...version(home.id,round),choice:'place',cell}:null,
    label:legal?'Place '+tokens[moves.length%2]+' '+names[cell]:'',focus:point};
}

export class TableMenu {
  constructor(street, listen) {
    const send = (choice, cell) => {
      if (this.command) street.session.command({...this.command,choice,cell});
    };
    this.cells = names.map((name, cell) => {
      const button = document.createElement('button');
      listen(button,'click',()=>send('place',cell));
      return button;
    });
    $('harbor-squares').replaceChildren(...this.cells);
    listen($('harbor-practice'),'click',()=>send('solo'));
    listen($('harbor-together'),'click',()=>send('together'));
  }
  refresh(session, actor, editing) {
    const pane = $('harbor-game');
    pane.hidden = editing || actor.activity !== 'tablegame';
    if (pane.hidden) { this.command=null; this.lastView=null; return; }
    const lot=actor.using.lot, round=roundAt(session,lot), moves=round?.moves || '';
    this.command=version(lot,round);
    const line=winningLine(moves), over=!!line || moves.length===9, turn=moves.length%2;
    const other=[...session.actors.values()].find(p=>p.id!==actor.id && p.activity==='tablegame' && p.using?.lot===lot);
    const name=id=>id===null?'Harbor House':session.actors.get(id)?.profile?.name || 'Visitor';
    const next=round?.players[turn], connected=session.owner || session.connected;
    let status='Take turns making a line of three. A friend can join at the board.';
    if (line) status=name(round.players[(moves.length-1)%2])+' wins with '+tokens[(moves.length-1)%2]+'s!';
    else if (over) status='A draw. Play another round?';
    else if (round) status=next===actor.id?'Your turn. Place a '+tokens[turn]+'.':name(next)+' plays the next '+tokens[turn]+'.';
    if (!connected) status='Reconnecting to the table…';
    const view=[lot,round?.id,moves,status,actor.id,other?.id,connected].join('|');
    if(view===this.lastView)return;
    this.lastView=view;
    if ($('harbor-turn').textContent!==status) $('harbor-turn').textContent=status;
    $('harbor-practice').hidden=!!other || !!round && !over;
    $('harbor-practice').disabled=!connected;
    $('harbor-together').hidden=!other || !!round && !over && !(round.players[1]===null && round.players[0]===actor.id);
    $('harbor-together').textContent=over?'Play again':'Play together';
    $('harbor-together').disabled=!connected;
    $('harbor-squares').hidden=!round;
    this.cells.forEach((button,cell)=>{
      const placed=moves.indexOf(String(cell)), kind=placed<0?'':tokens[placed%2];
      button.textContent=placed<0?'·':placed%2?'○':'▲';
      button.dataset.token=kind;
      button.classList.toggle('winning',!!line?.includes(cell));
      button.setAttribute('aria-label',names[cell]+', '+(kind || 'empty'));
      button.disabled=!connected || !round || over || next!==actor.id || placed>=0;
    });
  }
}
