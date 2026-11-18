import {Rng,hashSeed} from '../packages/sim/src/rng.js';

const jackets=['#c34e52','#387c91','#dfaa43','#7967a4','#39816c','#b2557c','#415e88','#bc7142','#657048','#e7c9ab'];
const skins=['#f1c5a3','#e4af88','#d29b71','#b77e5b','#975f45','#774c3e','#664233'];
const hairs=['#473932','#382f36','#ac7145','#754e37','#d5b480','#bbbec2','#783f36'];
const trousers=['#526a80','#514853','#74654e','#424d51','#887364','#435e4f'];
const trim=['#eadaab','#8ab7ac','#d49879','#52566c','#b3a0af'];
const paint=['#4e9589','#ae5c51','#e2b75f','#6985aa','#89965d','#d4c5a6'];
export function residentStyle(seed,lot){
  const rng=new Rng(hashSeed(seed+'|wardrobe|'+lot));
  return {coat:rng.pick(jackets),skin:rng.pick(skins),hair:rng.pick(hairs),pants:rng.pick(trousers),
    accent:rng.pick(trim),paint:rng.pick(paint),cut:rng.int(5),outfit:rng.int(4),glasses:rng.chance(.28),
    height:rng.range(.87,1.11),width:rng.range(.83,1.21)};
}
