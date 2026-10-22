/**
 * Atualização pelo próprio app, só quando o usuário clica: consulta a última Release no GitHub,
 * baixa o AppImage novo, confere o SHA-256 publicado na mesma Release e troca o arquivo.
 * Nenhum dado financeiro sai do computador: a única requisição é a leitura pública da Release.
 */
import { app, net, type WebContents } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { compararVersoes, hashDoArquivo } from './versao.ts'

const REPO = 'jszutkoski/Plataforma_financas'
const PAGINA = `https://github.com/${REPO}/releases/latest`

interface Release { tag_name: string; html_url: string; body: string | null; assets: { name: string; browser_download_url: string; size: number }[] }

export interface Verificacao {
  atual: string
  ultima: string
  nova: boolean
  notas: string
  pagina: string
  /** só o AppImage se atualiza sozinho; .deb e Windows abrem a página de download */
  podeInstalar: boolean
  motivo: string | null
}

async function ultimaRelease(): Promise<Release> {
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'financas-desktop' } })
  if (!r.ok) throw new Error(r.status === 403 ? 'O GitHub limitou as consultas por agora. Tente de novo em alguns minutos.' : `Não foi possível consultar o GitHub (HTTP ${r.status}).`)
  return (await r.json()) as Release
}

const arquivosDaRelease = (rel: Release) => ({
  appImage: rel.assets.find((a) => a.name.endsWith('.AppImage')) ?? null,
  somas: rel.assets.find((a) => a.name === 'SHA256SUMS-linux.txt') ?? null,
})

export async function verificar(): Promise<Verificacao> {
  const rel = await ultimaRelease()
  const atual = app.getVersion()
  const nova = compararVersoes(rel.tag_name, atual) > 0
  const { appImage, somas } = arquivosDaRelease(rel)
  const motivo = !process.env.APPIMAGE ? 'Esta instalação não é o AppImage: baixe o instalador na página da versão.'
    : !appImage ? 'A versão nova não tem AppImage.'
    : !somas ? 'A versão nova não publicou a soma de verificação (SHA256SUMS); baixe pela página.'
    : null
  return { atual, ultima: rel.tag_name.replace(/^v/, ''), nova, notas: rel.body ?? '', pagina: rel.html_url || PAGINA, podeInstalar: nova && !motivo, motivo: nova ? motivo : null }
}

let emAndamento = false

/** Baixa, confere o hash e substitui o AppImage em uso. O app continua aberto até o usuário reiniciar. */
export async function instalar(janela: WebContents): Promise<{ ok: true; versao: string }> {
  if (emAndamento) throw new Error('Já há uma atualização em andamento.')
  const destino = process.env.APPIMAGE
  if (!destino) throw new Error('Esta instalação não é o AppImage.')
  emAndamento = true
  const temp = `${destino}.baixando`
  try {
    const rel = await ultimaRelease()
    if (compararVersoes(rel.tag_name, app.getVersion()) <= 0) throw new Error('Você já está na versão mais recente.')
    const { appImage, somas } = arquivosDaRelease(rel)
    if (!appImage || !somas) throw new Error('A versão nova não tem AppImage com soma de verificação.')
    const rs = await net.fetch(somas.browser_download_url)
    if (!rs.ok) throw new Error(`Falha ao baixar a soma de verificação (HTTP ${rs.status}).`)
    const esperado = hashDoArquivo(await rs.text(), appImage.name)
    if (!esperado) throw new Error(`A soma de verificação não lista ${appImage.name}.`)

    const r = await net.fetch(appImage.browser_download_url)
    if (!r.ok || !r.body) throw new Error(`Falha ao baixar a versão nova (HTTP ${r.status}).`)
    const total = Number(r.headers.get('content-length')) || appImage.size
    const hash = crypto.createHash('sha256')
    const saida = fs.createWriteStream(temp, { mode: 0o755 })
    let recebido = 0, ultimoAviso = 0
    const leitor = r.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      hash.update(value)
      if (!saida.write(value)) await new Promise<void>((ok) => saida.once('drain', () => ok()))
      recebido += value.length
      const pct = total ? Math.floor((recebido / total) * 100) : 0
      if (pct !== ultimoAviso) { ultimoAviso = pct; janela.send('app:atualizacao-progresso', pct) }
    }
    await new Promise<void>((ok, falha) => saida.end((e?: Error | null) => (e ? falha(e) : ok())))
    if (hash.digest('hex') !== esperado) throw new Error('O arquivo baixado não confere com a soma de verificação publicada. Nada foi trocado.')
    fs.chmodSync(temp, 0o755)
    fs.renameSync(temp, destino) // troca atômica: o app aberto continua usando o arquivo antigo até reiniciar
    return { ok: true, versao: rel.tag_name.replace(/^v/, '') }
  } catch (e) {
    try { fs.rmSync(temp, { force: true }) } catch { /* nada a limpar */ }
    throw e
  } finally {
    emAndamento = false
  }
}

/** Reabre pelo AppImage (o executável atual vive numa montagem temporária que some ao sair). */
export function reiniciar() {
  if (process.env.APPIMAGE) app.relaunch({ execPath: process.env.APPIMAGE, args: [] })
  else app.relaunch()
  app.exit(0)
}
