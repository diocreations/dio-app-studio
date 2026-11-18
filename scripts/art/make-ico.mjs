// A 32x32 PNG inside an ICO container: the format browsers request at
// /favicon.ico, built from the same artwork as everything else.
import { readFileSync, writeFileSync } from 'node:fs'

const png = readFileSync('public/favicon-32.png')
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // icon
header.writeUInt16LE(1, 4) // one image
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt8(0, 8) // palette colours
header.writeUInt8(0, 9) // reserved
header.writeUInt16LE(1, 10) // planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18) // payload offset
writeFileSync('public/favicon.ico', Buffer.concat([header, png]))
console.log(`public/favicon.ico: ${header.length + png.length} bytes`)
