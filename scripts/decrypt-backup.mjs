// Abre um backup do Alania Task.
// Uso: node scripts/decrypt-backup.mjs <backup.json> <chave-privada-backup.pem> [saida.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { webcrypto as crypto } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const [file, keyFile, out = file.replace(/\.json$/, '') + '.aberto.json'] = process.argv.slice(2)
if (!file || !keyFile) {
  console.error('Uso: node scripts/decrypt-backup.mjs <backup.json> <chave-privada-backup.pem> [saida.json]')
  process.exit(1)
}
const box = JSON.parse(readFileSync(file, 'utf8'))
const pem = readFileSync(keyFile, 'utf8').replace(/-----[^-]+-----|\s/g, '')
const rsa = await crypto.subtle.importKey('pkcs8', Buffer.from(pem, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
const aesRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsa, Buffer.from(box.key, 'base64'))
const aes = await crypto.subtle.importKey('raw', aesRaw, 'AES-GCM', false, ['decrypt'])
const plain = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(box.iv, 'base64') }, aes, Buffer.from(box.data, 'base64')))
const text = (box.gzip ? gunzipSync(plain) : plain).toString('utf8')
writeFileSync(out, JSON.stringify(JSON.parse(text), null, 2))
console.log(`Backup de ${box.created_at} aberto em ${out}`)
console.log(box.counts)
