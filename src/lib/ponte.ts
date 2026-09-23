/**
 * Ponte com o processo principal. Substitui o `fetch` que existia quando a interface
 * falava com um servidor local: mesma forma de erro (mensagem + corpo), sem rede.
 */
export interface AppApi {
  chamar: <T>(canal: string, carga?: unknown) => Promise<{ ok: boolean; dados?: T; erro?: string; corpo?: unknown }>
  salvarArquivo: (nome: string, conteudo: string) => Promise<{ ok: boolean; arquivo?: string; cancelado?: boolean }>
  abrirPasta: (alvo: string) => Promise<void>
  info: () => Promise<{ versao: string; pastaDados: string; electron: string; node: string }>
}

declare global {
  interface Window { appApi?: AppApi }
}

const api = (): AppApi => {
  if (!window.appApi) throw new Error('Interface aberta fora do aplicativo.')
  return window.appApi
}

export async function chamar<T>(canal: string, carga?: unknown): Promise<T> {
  const r = await api().chamar<T>(canal, carga)
  if (!r.ok) {
    const e = new Error(r.erro ?? 'Falha na operação.') as Error & { corpo?: unknown }
    e.corpo = r.corpo ?? null
    throw e
  }
  return r.dados as T
}

/** Salva um arquivo pedindo a pasta ao usuário (backup, CSV). */
export async function salvarArquivo(nome: string, conteudo: string): Promise<string | null> {
  const r = await api().salvarArquivo(nome, conteudo)
  return r.ok ? r.arquivo ?? null : null
}

export const abrirPasta = (alvo: string) => api().abrirPasta(alvo)
export const infoApp = () => api().info()
