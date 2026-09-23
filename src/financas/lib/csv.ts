import type { Lancamento } from '@fin-shared/types'
import { TIPO_LABEL } from '@fin-shared/types'
import { fmtData } from './format'
import { salvarArquivo } from '@app/lib/ponte'

const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com separador ';' e decimal ',', compatível com Excel pt-BR. */
export function lancamentosParaCSV(L: Lancamento[]): string {
  const head = ['id', 'data', 'competencia', 'descricao', 'tipo', 'valor', 'grupo', 'categoria', 'subcategoria', 'conta', 'forma_pagamento', 'parcela', 'total_parcelas', 'observacoes', 'origem', 'origem_arquivo', 'dia_conhecido', 'fora_do_fluxo', 'ledger']
  const rows = L.map((l) => [
    l.id, fmtData(l.data), `${String(l.mes).padStart(2, '0')}/${l.ano}`, l.descricao, TIPO_LABEL[l.tipo], l.valor.toFixed(2).replace('.', ','), l.grupo, l.categoria, l.subcategoria,
    l.conta, l.formaPagamento, l.parcela, l.totalParcelas, l.observacoes, l.origem, l.origemArquivo, l.diaConhecido ? 'sim' : 'não', l.foraDoFluxo ? 'sim' : 'não', l.ledger,
  ].map(esc).join(';'))
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

export function tabelaParaCSV(cabecalho: string[], linhas: (string | number | null)[][]): string {
  return '﻿' + [cabecalho.map(esc).join(';'), ...linhas.map((r) => r.map((v) => typeof v === 'number' ? esc(v.toFixed(2).replace('.', ',')) : esc(v)).join(';'))].join('\r\n')
}

/** Grava o arquivo pedindo a pasta ao usuário (diálogo nativo do sistema). */
export function baixarArquivo(nome: string, conteudo: string): Promise<string | null> {
  return salvarArquivo(nome, conteudo)
}
