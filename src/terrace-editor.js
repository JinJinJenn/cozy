import {maxTables} from './terrace.js';
import {toRoom,toWorld} from './street-world.js';

const el=id=>document.getElementById(id);
export class TerraceEditor{
  constructor(street,listen){
    this.street=street;this.active=false;
    listen(el('terrace-open'),'click',()=>{
      if(this.active){street.selectLot(street.cafe);return;}
      this.open();
    });
    listen(el('terrace-slot'),'change',()=>this.select());
    listen(el('terrace-rotate'),'click',()=>{this.draft.turn=1-this.draft.turn;this.refresh();});
    listen(el('terrace-apply'),'click',()=>this.commit(this.draft));
    listen(el('terrace-remove'),'click',()=>this.commit(null));
    listen(el('terrace-undo'),'click',()=>this.commit(null,true));
  }
  open(){
    const st=this.street;if(!st.session.owner||st.buildLot!==st.cafe)return;
    this.active=true;el('wall-tools').hidden=true;el('wall-grip').hidden=true;el('terrace-tools').hidden=false;
    el('terrace-open').textContent='Edit café wall';
    st.art.preview(null,0,false);st.notice('');
    const b=st.cafe,center=toWorld(b,0,6.4),eye=toWorld(b,1,17);
    st.controls.target.set(center.x,b.y+.1,center.z);st.camera.position.set(eye.x,b.y+11.6,eye.z);st.controls.update();st.camera.updateMatrixWorld();
    this.options();this.select();
  }
  close(){
    this.active=false;this.draft=null;el('terrace-tools').hidden=true;el('wall-tools').hidden=false;
    el('terrace-open').textContent='Furnish café terrace';this.street.art.tablePreview(null);
  }
  options(preferred='new'){
    const select=el('terrace-slot'),tables=this.street.session.layout.terrace.tables;
    const opts=tables.map(t=>new Option('Table '+(t.id+1),String(t.id)));
    if(tables.length<maxTables)opts.unshift(new Option('New bistro table','new'));
    select.replaceChildren(...opts);if(opts.some(o=>o.value===String(preferred)))select.value=String(preferred);
  }
  select(){
    const v=el('terrace-slot').value,tables=this.street.session.layout.terrace.tables;
    const old=tables.find(t=>String(t.id)===v);let id=0;while(tables.some(t=>t.id===id))id++;
    this.draft=old?{...old}:{id,x:3,z:8,turn:1};this.refresh();
  }
  aim(e){
    if(!this.active)return;
    const st=this.street,b=st.cafe,r=st.controls.domElement.getBoundingClientRect();
    st.ray.setFromCamera({x:2*(e.clientX-r.left)/r.width-1,y:1-2*(e.clientY-r.top)/r.height},st.camera);
    st.plane.constant=-b.y;
    const hit=st.ray.ray.intersectPlane(st.plane,st.point);if(!hit)return;
    const p=toRoom(b,hit);this.draft.x=Math.round(p.x*2)/2;this.draft.z=Math.round(p.z*2)/2;this.refresh();
  }
  refresh(){
    if(!this.active)return;
    const s=this.street.session,t=this.draft,reason=s.tableIssue(t.id,t);
    const old=s.layout.terrace.tables.find(v=>v.id===t.id);
    const same=old&&t.x===old.x&&t.z===old.z&&t.turn===old.turn;
    this.street.art.tablePreview(same?null:t,!reason);el('terrace-apply').disabled=!!reason||!!same;
    el('terrace-apply').textContent=old?'Move table':'Place table';el('terrace-remove').hidden=!old;
    el('terrace-remove').disabled=!!old&&!!s.tableIssue(t.id,null);
    el('terrace-undo').disabled=!s.layout.terrace.undo.length;
    el('terrace-status').textContent=reason||'Click the terrace to position both chairs.';
  }
  commit(next,undo=false){
    const s=this.street.session,id=this.draft.id;
    if(s.editTable(id,next,undo)){this.options(next?id:'new');this.select();}
    else this.refresh();
  }
}
