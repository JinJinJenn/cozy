// A local signalling fixture for isolated Chromium profiles. Only Nostr
// messages pass through this fixture. Game packets use native RTCDataChannels.
export function testNostrRelay(){
  const relays=new Map();
  const accepts=(event,filter)=>filter.kinds.includes(event.kind)&&event.created_at>=filter.since&&
    event.tags.some(([key,value])=>key==='x'&&filter['#x'].includes(value));
  return async context=>{
    // Both profiles share this machine. Use native host ICE candidates so the
    // local fixture can establish a connection while public STUN is offline.
    await context.addInitScript(()=>{
      const NativePeer=window.RTCPeerConnection;
      window.RTCPeerConnection=class extends NativePeer{
        constructor(config){super({...config,iceServers:[]});}
      };
    });
    return context.routeWebSocket(/^wss:\/\//,socket=>{
      const url=socket.url();
      if(!relays.has(url))relays.set(url,{clients:new Map(),recent:new Map()});
      const {clients,recent}=relays.get(url);
      const subscriptions=new Map();
      clients.set(socket,subscriptions);
      const send=(target,packet)=>target.send(JSON.stringify(packet));
      socket.onClose(()=>clients.delete(socket));
      socket.onMessage(raw=>{
        const [type,value,filter]=JSON.parse(raw);
        if(type==='REQ'){
          subscriptions.set(value,filter);
          for(const e of recent.values())if(accepts(e,filter))send(socket,['EVENT',value,e]);
          send(socket,['EOSE',value]);
        }else if(type==='CLOSE'){
          subscriptions.delete(value);
        }else if(type==='EVENT'){
          const event=value;
          send(socket,['OK',event.id,true,'']);
          if(recent.has(event.id))return;
          recent.set(event.id,event);
          for(const [id,e] of recent)if(e.created_at<Date.now()/1000-60)recent.delete(id);
          for(const [peer,subs] of clients)for(const [id,f] of subs)
            if(accepts(event,f))send(peer,['EVENT',id,event]);
        }
      });
    });
  };
}
