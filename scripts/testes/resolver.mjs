import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../../', import.meta.url)
const aliases = { '@app/': 'src/', '@fin/': 'src/financas/', '@pat/': 'src/patrimonio/', '@fin-shared/': 'shared/financas/', '@pat-shared/': 'shared/patrimonio/' }

/** Completa a extensão (.ts/.tsx) quando o arquivo existe sem ela. */
function comExtensao(url) {
  if (/\.[cm]?[jt]sx?$/.test(url)) return url
  for (const ext of ['.ts', '.tsx']) if (fs.existsSync(fileURLToPath(url + ext))) return url + ext
  return url
}

export function resolve(especificador, contexto, proximo) {
  for (const [alias, pasta] of Object.entries(aliases)) {
    if (especificador.startsWith(alias)) return proximo(comExtensao(new URL(pasta + especificador.slice(alias.length), raiz).href), contexto)
  }
  if (especificador.startsWith('.') && contexto.parentURL?.startsWith(raiz.href)) return proximo(comExtensao(new URL(especificador, contexto.parentURL).href), contexto)
  return proximo(especificador, contexto)
}
