// Keep the triangle stream for CPU geometry consumers. An index lets the GPU
// reuse a transformed vertex only when all its Float32 attributes match.
export function indexRepeatedVertices(geometry){
  const attributes=Object.values(geometry.attributes);
  const parts=attributes.map(({array,itemSize})=>({
    words:new Uint32Array(array.buffer,array.byteOffset,array.length),itemSize
  }));
  const first=new Map(),indices=[];
  for(let i=0;i<geometry.attributes.position.count;i++){
    let key='';
    for(const {words,itemSize} of parts){
      const start=i*itemSize;
      for(let n=0;n<itemSize;n++)key+=words[start+n]+',';
    }
    if(!first.has(key))first.set(key,i);
    indices.push(first.get(key));
  }
  geometry.setIndex(indices);
  return geometry;
}
