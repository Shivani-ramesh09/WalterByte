// A QR-looking placeholder for the demo UPI payment. It is NOT a real,
// scannable UPI code: it is drawn from a hash of `seed` so it stays stable.
// shortcut: replace with a real UPI intent QR (upi://pay?...) once a gateway is integrated
const SIZE = 25

function hashBits(seed) {
  let h = 2166136261
  const bits = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i
    h = Math.imul(h, 16777619)
    bits.push((h >>> 15) & 1)
  }
  return bits
}

const inFinder = (x, y) =>
  [[0, 0], [SIZE - 7, 0], [0, SIZE - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)

function finder(fx, fy) {
  return (
    <g key={`${fx}-${fy}`}>
      <rect x={fx} y={fy} width={7} height={7} fill="#261a1d" />
      <rect x={fx + 1} y={fy + 1} width={5} height={5} fill="#fff" />
      <rect x={fx + 2} y={fy + 2} width={3} height={3} fill="#261a1d" />
    </g>
  )
}

export default function DemoQr({ seed, size = 200 }) {
  const bits = hashBits(seed || 'demo')
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${SIZE + 4} ${SIZE + 4}`} role="img" aria-label="Demo UPI QR code (not a real payment code)" shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={SIZE + 4} height={SIZE + 4} fill="#fff" />
      {bits.map((b, i) => {
        const x = i % SIZE
        const y = Math.floor(i / SIZE)
        return b && !inFinder(x, y) ? <rect key={i} x={x} y={y} width={1} height={1} fill="#261a1d" /> : null
      })}
      {finder(0, 0)}
      {finder(SIZE - 7, 0)}
      {finder(0, SIZE - 7)}
    </svg>
  )
}
