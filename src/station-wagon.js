import * as THREE from 'three';

const cream='#eee0bd',chrome='#c0cbc1',paint='#4e9589',trim='#425456',wood='#b77b4f';

// The sill runs around both wheels. The bonnet and tailgate have different
// heights, so the estate reads in silhouette even at the far side of town.
const outline=new THREE.Shape();
outline.moveTo(-1.52,.34);outline.lineTo(-1.39,.34);
outline.bezierCurveTo(-1.39,.84,-.63,.84,-.63,.34);
outline.lineTo(.63,.34);outline.bezierCurveTo(.63,.84,1.39,.84,1.39,.34);
outline.lineTo(1.51,.34);outline.lineTo(1.56,.67);outline.lineTo(1.46,.77);
outline.lineTo(.74,.88);outline.lineTo(.61,.93);outline.lineTo(-1.45,.93);
outline.lineTo(-1.54,.77);outline.closePath();
const hull=new THREE.ExtrudeGeometry(outline,{depth:.09,bevelThickness:.033,bevelSize:.027,bevelSegments:2,curveSegments:7});
hull.translate(0,0,-.045);hull.rotateY(-Math.PI/2);

function windows(chassis){
  const vertices=[],indices=[];
  function pane(a,b,c,d){
    const n=vertices.length/3;
    vertices.push(...a,...b,...c,...d);indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  for(const side of [-1,1]){
    const x=.769*side,top=.686*side;
    pane([x,.94,-1.43],[x,.94,.69],[top,1.59,.30],[top,1.59,-1.31]);
  }
  pane([-.769,.94,.69],[.769,.94,.69],[.686,1.59,.30],[-.686,1.59,.30]);
  pane([.769,.94,-1.43],[-.769,.94,-1.43],[-.686,1.59,-1.31],[.686,1.59,-1.31]);
  const glass=new THREE.BufferGeometry();
  glass.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  glass.setIndex(indices);glass.computeVertexNormals();
  const tint=new THREE.MeshLambertMaterial({color:'#b1d9d2',transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(glass,tint);mesh.name='estate-glass';chassis.add(mesh);
}

export function wagonBody(p,chassis,strut,steeringHoop){
  windows(chassis);
  p.box(0,.39,-.02,1.49,.14,2.86,trim);
  p.box(0,.65,1.45,1.49,.23,.18,paint);
  p.box(0,.65,-1.47,1.50,.54,.14,paint);
  p.box(0,.91,-1.43,1.54,.064,.09,chrome);
  p.box(0,.67,-1.16,1.41,.08,.49,'#6a6357');
  for(const x of [-.44,0,.44])p.box(x,.719,-1.17,.018,.013,.40,chrome);
  p.box(0,1.608,-.50,1.45,.068,1.79,cream);
  p.ball(0,1.628,-.50,1.48,.105,1.84,cream);
  for(const s of [-1,1]){
    p.put(hull,s*.729,0,0,1,1,1,paint);
    for(const z of [-1.14,.13])p.box(s*.524,1.686,z,.045,.079,.10,trim);
    p.box(s*.524,1.73,-.505,.042,.041,1.40,chrome);
  }
  p.box(0,.83,1.08,1.36,.047,.69,paint,0,0,.13);
  p.box(0,.61,1.567,1.47,.20,.035,trim);
  for(const y of [.55,.60,.65])p.box(0,y,1.590,.70,.016,.023,chrome);
  for(const z of [-1.55,1.56])p.box(0,.405,z,1.68,.095,.10,chrome);
  p.box(0,.67,-1.558,.38,.135,.020,'#e7ce94');
  p.box(0,.827,-1.51,.43,.039,.036,chrome);
  p.box(0,.985,.56,1.34,.13,.20,trim);
  p.put(steeringHoop,.34,.945,.25,.175,.175,.18,trim,0,0,-.4);
  p.box(0,.62,-.67,1.32,.13,.38,'#a77956');
  p.box(0,.834,-.86,1.32,.43,.13,'#996b50',0,0,-.10);
  for(const s of [-1,1]){
    // Door seals, handles and timber inlays follow the belt below the glazing.
    p.box(s*.812,.80,-.26,.025,.115,2.45,wood);
    p.box(s*.819,.868,-.26,.016,.022,2.46,cream);
    p.box(s*.816,.65,-.18,.018,.35,.019,trim);
    for(const z of [.01,-.70])p.box(s*.818,.893,z,.035,.030,.16,chrome);
    p.box(s*.771,.94,-.37,.043,.044,2.12,trim);
    for(const [base,top,w] of [[.69,.30,.052],[-.20,-.24,.055],[-.81,-.83,.043],[-1.43,-1.31,.084]]){
      strut(p,[s*.769,.94,base],[s*.686,1.59,top],w,paint);
    }
    p.box(s*.536,.645,1.589,.28,.139,.026,cream);
    p.box(s*.716,.64,1.586,.059,.135,.029,'#e7ad57');
    p.box(s*.65,.665,-1.541,.172,.21,.043,'#a3483f');
    p.box(s*.65,.756,-1.543,.164,.047,.047,'#e7ad57');
    p.box(s*.34,1.088,-.88,.24,.16,.105,'#996b50');
    p.box(s*.34,.64,-.24,.53,.14,.54,'#a77956');
    p.box(s*.34,.83,-.47,.53,.41,.14,'#996b50',0,0,-.10);
    p.box(s*.34,1.067,-.49,.22,.13,.11,'#996b50');
    p.ball(s*.830,1.015,.525,.15,.094,.11,trim);
  }
}
