/**
 * Processo principal: abre a janela, guarda os bancos na pasta de dados do usuário e
 * atende a interface por IPC. Não há servidor HTTP nem porta aberta.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import * as atualizacao from './atualizacao.ts'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const RAIZ = path.join(__dirname, '..')

/** Pasta de dados do usuário (%APPDATA% no Windows, ~/.local/share no Linux). */
const pastaDados = (): string => {
  const dir = path.join(app.getPath('userData'), 'dados')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Primeira execução: traz os bancos dos apps antigos (~/financas, ~/patrimonio), se existirem.
 * `VACUUM INTO` copia de forma consistente mesmo com WAL pendente, e não altera a origem.
 */
function migrarBancosAntigos(dir: string) {
  const origens: [string, string][] = [
    [process.env.FINANCAS_DB_ANTIGO ?? path.join(os.homedir(), 'financas', 'data', 'financas.db'), path.join(dir, 'financas.db')],
    [process.env.PATRIMONIO_DB_ANTIGO ?? path.join(os.homedir(), 'patrimonio', 'data', 'patrimonio.db'), path.join(dir, 'patrimonio.db')],
  ]
  for (const [origem, destino] of origens) {
    if (fs.existsSync(destino) || !fs.existsSync(origem)) continue
    try {
      const src = new DatabaseSync(origem, { readOnly: true })
      try { src.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`) } finally { src.close() }
      console.log(`[migração] ${origem} → ${destino}`)
    } catch (e) {
      console.error(`[migração] falhou para ${origem}:`, e)
    }
  }
}

async function registrarCanais() {
  // importados só depois que os caminhos dos bancos estão definidos (os módulos abrem o SQLite ao carregar)
  const financas = await import('../core/financas/api.ts')
  const patrimonio = await import('../core/patrimonio/api.ts')
  financas.iniciar()

  const modulos: Record<string, Record<string, unknown>> = { fin: financas, pat: patrimonio }

  ipcMain.handle('app:chamar', async (_e, canal: string, carga: unknown) => {
    const [ns, operacao] = String(canal).split(':')
    const fn = modulos[ns]?.[operacao]
    if (typeof fn !== 'function') return { ok: false, erro: `Operação desconhecida: ${canal}` }
    try {
      const dados = await (fn as (c: unknown) => unknown)(carga)
      return { ok: true, dados }
    } catch (e) {
      const err = e as Error & { corpo?: unknown }
      console.error(`[${canal}]`, err)
      return { ok: false, erro: err.message ?? String(e), corpo: err.corpo ?? null }
    }
  })

  // salvar arquivo (backup, CSV): diálogo nativo em vez de download do navegador
  ipcMain.handle('app:salvar-arquivo', async (e, nomeSugerido: string, conteudo: string) => {
    const janela = BrowserWindow.fromWebContents(e.sender)!
    const { canceled, filePath } = await dialog.showSaveDialog(janela, { defaultPath: path.join(app.getPath('downloads'), nomeSugerido) })
    if (canceled || !filePath) return { ok: false, cancelado: true }
    fs.writeFileSync(filePath, conteudo, 'utf8')
    return { ok: true, arquivo: filePath }
  })

  ipcMain.handle('app:abrir-pasta', (_e, alvo: string) => shell.showItemInFolder(alvo))
  // atualização: só quando o usuário pede (nenhuma consulta automática ao abrir)
  const resultado = async <T>(fn: () => Promise<T> | T) => { try { return { ok: true, dados: await fn() } } catch (e) { return { ok: false, erro: (e as Error).message ?? String(e) } } }
  ipcMain.handle('app:atualizacao-verificar', () => resultado(() => atualizacao.verificar()))
  ipcMain.handle('app:atualizacao-instalar', (e) => resultado(() => atualizacao.instalar(e.sender)))
  ipcMain.handle('app:reiniciar', () => atualizacao.reiniciar())
  ipcMain.handle('app:info', () => ({ versao: app.getVersion(), pastaDados: pastaDados(), electron: process.versions.electron, node: process.versions.node }))
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    title: 'Finanças',
    icon: path.join(RAIZ, 'recursos', 'icone.png'),
    backgroundColor: '#111417',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  janela.on('page-title-updated', (e) => e.preventDefault())
  if (DEV_URL) janela.loadURL(DEV_URL)
  else janela.loadFile(path.join(RAIZ, 'dist', 'index.html'))
  // links externos abrem no navegador do sistema, nunca dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  return janela
}

// uma instância só: dois processos gravando no mesmo banco causariam conflito
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [j] = BrowserWindow.getAllWindows()
    if (j) { if (j.isMinimized()) j.restore(); j.focus() }
  })

  app.whenReady().then(async () => {
    const dir = pastaDados()
    migrarBancosAntigos(dir)
    process.env.FINANCAS_DB ??= path.join(dir, 'financas.db')
    process.env.PATRIMONIO_DB ??= path.join(dir, 'patrimonio.db')
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Arquivo', submenu: [{ role: 'quit', label: 'Sair' }] },
      { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
      { label: 'Exibir', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'resetZoom', label: 'Zoom normal' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reduzir' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' }] },
    ]))
    await registrarCanais()
    criarJanela()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
