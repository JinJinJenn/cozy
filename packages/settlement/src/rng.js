// Small seeded RNG (mulberry32) with string hashing. No Math.random anywhere in this package.
export function hashStr(s){let h=2166136261>>>0;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
export function mulberry32(a){return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function rngFor(seed,tag){return mulberry32(hashStr(seed+'|'+tag));}
