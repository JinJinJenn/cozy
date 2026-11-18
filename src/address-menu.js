const el=id=>document.getElementById(id);
const distanceMoved=(p,last)=>last?Math.hypot(p.x-last.x,p.z-last.z):Infinity;
const messages={
  taken:'Another player has that address.',
  small:'This lot is too small for your saved home.',
  'other-device':'Your address is in use on another device.',
  'other-save':'This player already holds an address with another save.',
  released:'Address released. Your private home is saved.',
  expired:'That reservation has expired.',
  invalid:'Choose a generated house in the public town.',
  unavailable:'The town has reached its address limit.',
  timeout:'The host did not confirm. Check the address and try again.'
};

export class AddressMenu{
  constructor(street,listen){
    this.street=street;
    listen(el('address-open'),'click',()=>{
      street.closePanels();el('social-pane').hidden=false;
      this.refresh(this.near);
      const primary=['address-travel','address-alternative','address-claim'].map(el).find(button=>!button.hidden);
      primary?.focus();
    });
    listen(el('address-claim'),'click',()=>this.request('claim',this.target?.id));
    listen(el('address-alternative'),'click',()=>this.request('claim',street.session.addresses.result?.lot));
    listen(el('address-release'),'click',()=>this.request('release',street.session.addresses.own?.lot));
    listen(el('address-travel'),'click',()=>{
      const place=street.session.addresses.own?.lot;
      if(place){street.cameraFocus=null;street.closePanels();street.session.command({type:'teleport',place});}
    });
  }
  request(action,id){
    if(id)void this.street.session.addresses.request(action,id);
  }
  refresh(near){
    const s=this.street.session,address=s?.addresses;this.near=near;
    el('address-open').hidden=!address||near?.kind!=='home'||!!this.street.buildLot||!el('social-pane').hidden;
    el('address-panel').hidden=!address;
    if(!address)return;
    const own=address.own,book=address.book,local=s.actors.get(s.id),here=near?.kind==='home'?near:null;
    if(here){
      const claim=book.byLot(here.id);
      el('address-open').textContent=claim?(claim.key===address.key?'Your address':'Claimed address'):'Home address';
    }
    if(el('social-pane').hidden){this.target=null;return;}
    // Offer the nearest front door when opening Multiplayer from the square.
    if(here)this.target=here;
    else if(!this.target||this.previousNear||distanceMoved(local,this.lastSearch)>8){
      let distance=Infinity;
      for(const home of book.homes.values()){
        const d=(home.x-local.x)**2+(home.z-local.z)**2;
        if(d<distance){this.target=home;distance=d;}
      }
      this.lastSearch={x:local.x,z:local.z};
    }
    this.previousNear=here;
    const target=this.target,reply=address.result,other=reply?.lot&&book.homes.get(reply.lot);
    const alternative=['taken','small'].includes(reply?.code)&&other&&!own;
    const connected=s.ready&&(s.owner||address.synced&&s.connected);
    el('address-name').textContent=own?'Your public address · '+book.homes.get(own.lot).name:'Public address'+(target?' · '+target.name:'');
    const status=address.busy?'Waiting for the town host…':!connected?'Joining the town host…':
      reply?.code==='error'?reply.message:messages[reply?.code]||
      (own?'Your private home opens by invitation.':target&&book.byLot(target.id)?'This address is claimed. You can ask for a nearby lot.':'Choose a public address for this visit. Your private rooms stay in your save.');
    const statusNode=el('address-status');if(statusNode.textContent!==status)statusNode.textContent=status;
    el('address-claim').hidden=!!own||!!alternative||!target;
    if(target)el('address-claim').textContent=book.byLot(target.id)?'Find another address':'Claim '+target.name;
    el('address-alternative').hidden=!alternative;
    if(alternative)el('address-alternative').textContent='Claim nearby '+other.name;
    for(const id of ['address-release','address-travel','address-private'])el(id).hidden=!own;
    for(const id of ['address-release','address-claim','address-alternative'])el(id).disabled=address.busy||!connected;
    if(own){
      const url=new URL(el('personal-street').href);url.searchParams.set('home',own.home);
      el('address-private').href=url.href;
    }
  }
}
