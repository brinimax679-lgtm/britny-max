// Utilidades de identificadores y hash de contraseñas para el modo demo.
// SHA-256 en JavaScript puro: funciona también fuera de contextos seguros
// (por ejemplo, al abrir la app desde el celular por la IP de la red local).

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const K = []
const H0 = []
;(() => {
  const frac = (x) => ((x - Math.floor(x)) * 0x100000000) | 0
  const esPrimo = (n) => {
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
    return true
  }
  for (let n = 2; K.length < 64; n++) {
    if (!esPrimo(n)) continue
    if (H0.length < 8) H0.push(frac(Math.pow(n, 1 / 2)))
    K.push(frac(Math.pow(n, 1 / 3)))
  }
})()

const ror = (x, n) => (x >>> n) | (x << (32 - n))

export function sha256(texto) {
  const bytes = new TextEncoder().encode(texto)
  const largo = bytes.length
  const datos = new Uint8Array(((largo + 9 + 63) >> 6) << 6)
  datos.set(bytes)
  datos[largo] = 0x80
  const vista = new DataView(datos.buffer)
  const bits = largo * 8
  vista.setUint32(datos.length - 4, bits >>> 0)
  vista.setUint32(datos.length - 8, Math.floor(bits / 0x100000000))

  const H = H0.slice()
  const w = new Int32Array(64)
  for (let i = 0; i < datos.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getInt32(i + t * 4)
    for (let t = 16; t < 64; t++) {
      const s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let t = 0; t < 64; t++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    H[0] = (H[0] + a) | 0
    H[1] = (H[1] + b) | 0
    H[2] = (H[2] + c) | 0
    H[3] = (H[3] + d) | 0
    H[4] = (H[4] + e) | 0
    H[5] = (H[5] + f) | 0
    H[6] = (H[6] + g) | 0
    H[7] = (H[7] + h) | 0
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

export function hashContrasena(contrasena, sal) {
  return sha256(`${sal}:${contrasena}`)
}

export function nuevaSal() {
  return uid().replaceAll('-', '')
}
