import { salvarArquivo } from '@app/lib/ponte'
/** Exportação de tabelas em CSV (separador ; e vírgula decimal, como o Excel em pt-BR espera). */
export function paraCSV(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return ''
  const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  const esc = (v: unknown): string => {
    if (v == null) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    if (typeof v === 'boolean') return v ? 'sim' : 'não'
    const s = Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\n')
}

/** Grava o arquivo pedindo a pasta ao usuário (diálogo nativo do sistema). */
export function baixarTexto(nome: string, conteudo: string): Promise<string | null> {
  return salvarArquivo(nome, '﻿' + conteudo)
}
export const baixarCSV = (nome: string, linhas: Record<string, unknown>[]) => baixarTexto(nome, paraCSV(linhas))
export const baixarJSON = (nome: string, obj: unknown) => salvarArquivo(nome, JSON.stringify(obj, null, 1))
