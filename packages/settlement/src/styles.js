// Per-locale planning rules. A style is only data: cost weights, branching rule, lot sizes. Unknown ids fall back to meadowCove.
export const STYLES={
  harborTown:{type:'grid',sites:4,spacing:380,R:140,streetSpacing:42,gradeMax:0.25,wGrade:2,wSlope:3,maxHalf:3,shoreDist:6,shoreW:0.5,
    widths:{main:7,street:5.5,path:2.6},lotW:11,lotD:17,slopeLimit:0.18,streetClass:'street'},
  meadowCove:{type:'organic',sites:3,spacing:420,R:130,spokes:9,rings:[0.3,0.55,0.8],noiseAmp:1.1,gradeMax:0.3,wGrade:1.5,wSlope:2,maxHalf:3,shoreDist:6,shoreW:0.4,landFrac:0.8,landRadius:120,
    widths:{main:6.5,street:4.8,path:2.4},lotW:12,lotD:18,slopeLimit:0.18,streetClass:'street'},
  sandbarArchipelago:{type:'boardwalk',sites:4,spacing:200,R:110,spokes:6,rings:[0.5],gradeMax:0.3,wGrade:1,wSlope:2,maxHalf:3,shoreDist:3,shoreW:1.2,landFrac:0.3,
    widths:{main:5,street:3.4,path:3.0},lotW:10,lotD:14,slopeLimit:0.2,streetClass:'path'},
  pineHighlands:{type:'switchback',sites:3,spacing:420,R:130,spokes:8,rings:[0.35,0.65],gradeMax:0.11,gradeRef:0.06,wGrade:8,wSlope:6,maxHalf:3,shoreDist:6,shoreW:0.3,
    widths:{main:6,street:4.4,path:2.2},lotW:13,lotD:19,slopeLimit:0.2,streetClass:'street'},
};
export function styleFor(id){return {id:STYLES[id]?id:'meadowCove',...STYLES[STYLES[id]?id:'meadowCove']};}
