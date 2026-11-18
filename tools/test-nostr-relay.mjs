// Only discovery passes through this fixture. Game packets use native RTCDataChannels.
export function testNostrRelay(){
  const relays=new Map(),signalGates=new WeakMap();
  const accepts=(event,filter)=>filter.kinds.includes(event.kind)&&event.created_at>=filter.since&&
    event.tags.some(([key,value])=>key==='x'&&filter['#x'].includes(value));
  return async (context,signalGate)=>{
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
      if(!relays.has(url))relays.set(url,{clients:new Map(),recent:new Map(),swarms:new Map()});
      const {clients,recent,swarms}=relays.get(url);
      const subscriptions=new Map();
      clients.set(socket,subscriptions);
      if(signalGate)signalGates.set(socket,signalGate);
      const send=(target,packet)=>{
        if(packet[0]==='EVENT'&&signalGates.get(target)?.()===false)return;
        target.send(JSON.stringify(packet));
      };
      socket.onClose(()=>{
        clients.delete(socket);
        for(const [hash,swarm] of swarms){
          for(const [peer,client] of swarm)if(client===socket)swarm.delete(peer);
          if(!swarm.size)swarms.delete(hash);
        }
      });
      socket.onMessage(raw=>{
        const packet=JSON.parse(raw);
        if(!Array.isArray(packet)){
          if(packet.action!=='announce'||!packet.info_hash||!packet.peer_id)return;
          const {info_hash,peer_id,to_peer_id,offer_id,answer,offers=[]}=packet;
          if(!swarms.has(info_hash))swarms.set(info_hash,new Map());
          const swarm=swarms.get(info_hash);
          swarm.set(peer_id,socket);
          const base={action:'announce',info_hash,peer_id};
          if(answer&&swarm.has(to_peer_id))send(swarm.get(to_peer_id),{...base,to_peer_id,offer_id,answer});
          else{
            const others=[...swarm.keys()].filter(id=>id!==peer_id);
            for(let i=0;i<Math.min(offers.length,others.length);i++)
              send(swarm.get(others[i]),{...base,...offers[i],to_peer_id:others[i]});
          }
          return;
        }
        const [type,value,filter]=packet;
        if(type==='REQ'){
          subscriptions.set(value,filter);
          for(const e of recent.values())if(accepts(e,filter))send(socket,['EVENT',value,e]);
          send(socket,['EOSE',value]);
        }else if(type==='CLOSE'){
          subscriptions.delete(value);
        }else if(type==='EVENT'){
          if(signalGates.get(socket)?.()===false)return;
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
