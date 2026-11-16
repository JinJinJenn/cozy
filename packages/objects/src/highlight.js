// Soft-highlight helpers: a stable per-peer colour (FNV-1a over the peer id).
const PALETTE = ['#ff8fab', '#ffb86b', '#f2e05c', '#8fe3a1', '#6fd6e8', '#8fa8ff', '#c79bff', '#ff9bd6'];

export function colorForPeer(peerId) {
  let h = 0x811c9dc5;
  for (let i = 0; i < peerId.length; i++) {
    h ^= peerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
