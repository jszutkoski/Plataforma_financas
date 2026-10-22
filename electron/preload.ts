/** Única ponte entre a interface e o processo principal. A janela não tem acesso a Node. */
import { contextBridge, ipcRenderer } from 'electron'

const NAMESPACES = ['fin', 'pat']

contextBridge.exposeInMainWorld('appApi', {
  chamar: (canal: string, carga?: unknown) => {
    if (!NAMESPACES.includes(String(canal).split(':')[0])) return Promise.reject(new Error(`Canal não permitido: ${canal}`))
    return ipcRenderer.invoke('app:chamar', canal, carga)
  },
  salvarArquivo: (nome: string, conteudo: string) => ipcRenderer.invoke('app:salvar-arquivo', nome, conteudo),
  abrirPasta: (alvo: string) => ipcRenderer.invoke('app:abrir-pasta', alvo),
  info: () => ipcRenderer.invoke('app:info'),
  atualizacao: {
    verificar: () => ipcRenderer.invoke('app:atualizacao-verificar'),
    instalar: () => ipcRenderer.invoke('app:atualizacao-instalar'),
    reiniciar: () => ipcRenderer.invoke('app:reiniciar'),
    aoProgredir: (fn: (pct: number) => void) => {
      const ouvinte = (_e: unknown, pct: number) => fn(pct)
      ipcRenderer.on('app:atualizacao-progresso', ouvinte)
      return () => { ipcRenderer.removeListener('app:atualizacao-progresso', ouvinte) }
    },
  },
})
