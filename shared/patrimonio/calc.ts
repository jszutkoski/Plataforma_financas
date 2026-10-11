/**
 * Cálculos patrimoniais — funções puras sobre a base carregada (sem acesso a banco ou DOM).
 * Convenções (ver docs/ESTRUTURA_DADOS.md):
 *  - posição de (ano, mes) = saldo no FECHAMENTO do mês;
 *  - resultado do mês = saldoFinal − saldoInicial − dinheiro novo (+ ajustes) [+ proventos pagos fora da posição, nos meses manuais];
 *  - um dado ausente é null, nunca zero; "dados insuficientes" é uma resposta válida.
 */
import {
  chaveMes, mesAnterior, CATEGORIAS_COM_QUANTIDADE, TIPOS_ENTRADA, TIPOS_SAIDA,
  type Investimento, type Posicao, type PosicaoConsolidada, type Movimentacao, type FluxoConsolidado, type Conta, type SaldoConta,
  type Bem, type AvaliacaoBem, type Divida, type SaldoDivida, type Fechamento, type CategoriaInvestimento,
} from './types.ts'

export interface Base {
  investimentos: Investimento[]
  posicoes: Posicao[]
  posicoesConsolidadas: PosicaoConsolidada[]
  movimentacoes: Movimentacao[]
  fluxosConsolidados: FluxoConsolidado[]
  contas: Conta[]
  saldosConta: SaldoConta[]
  bens: Bem[]
  avaliacoesBem: AvaliacaoBem[]
  dividas: Divida[]
  saldosDivida: SaldoDivida[]
  fechamentos: Fechamento[]
}

export const r2 = (v: number): number => Math.round(v * 100) / 100
const fimDoMes = (ano: number, mes: number): string => `${chaveMes(ano, mes)}-${new Date(ano, mes, 0).getDate()}`
const cmp = (a: number, m1: number, b: number, m2: number): number => a * 12 + m1 - (b * 12 + m2)

// ---------------------------------------------------------------- índices
export interface Indices {
  posPorInv: Map<string, Map<string, Posicao>>          // invId -> "aaaa-mm" -> posição
  consCarteira: Map<string, PosicaoConsolidada>          // "aaaa-mm" -> total da carteira
  consCategoria: Map<string, PosicaoConsolidada[]>       // "aaaa-mm" -> por categoria
  movPorInv: Map<string, Movimentacao[]>                 // invId -> movimentações datadas, ordenadas
  movPorMes: Map<string, Movimentacao[]>                 // "aaaa-mm" -> movimentações
  fluxos: Map<string, FluxoConsolidado>
  fechamentos: Map<string, Fechamento>
  invPorId: Map<string, Investimento>
}

export function indexar(b: Base): Indices {
  const posPorInv = new Map<string, Map<string, Posicao>>()
  for (const p of b.posicoes) {
    if (!posPorInv.has(p.investimentoId)) posPorInv.set(p.investimentoId, new Map())
    posPorInv.get(p.investimentoId)!.set(chaveMes(p.ano, p.mes), p)
  }
  const consCarteira = new Map<string, PosicaoConsolidada>()
  const consCategoria = new Map<string, PosicaoConsolidada[]>()
  for (const c of b.posicoesConsolidadas) {
    const k = chaveMes(c.ano, c.mes)
    if (c.escopo === 'carteira') consCarteira.set(k, c)
    else { if (!consCategoria.has(k)) consCategoria.set(k, []); consCategoria.get(k)!.push(c) }
  }
  const movPorInv = new Map<string, Movimentacao[]>()
  const movPorMes = new Map<string, Movimentacao[]>()
  const ordenadas = [...b.movimentacoes].sort((x, y) => (x.data ?? '9999').localeCompare(y.data ?? '9999'))
  for (const m of ordenadas) {
    if (m.investimentoId) { if (!movPorInv.has(m.investimentoId)) movPorInv.set(m.investimentoId, []); movPorInv.get(m.investimentoId)!.push(m) }
    if (m.ano && m.mes) { const k = chaveMes(m.ano, m.mes); if (!movPorMes.has(k)) movPorMes.set(k, []); movPorMes.get(k)!.push(m) }
  }
  return {
    posPorInv, consCarteira, consCategoria, movPorInv, movPorMes,
    fluxos: new Map(b.fluxosConsolidados.map((f) => [chaveMes(f.ano, f.mes), f])),
    fechamentos: new Map(b.fechamentos.map((f) => [chaveMes(f.ano, f.mes), f])),
    invPorId: new Map(b.investimentos.map((i) => [i.id, i])),
  }
}

// ---------------------------------------------------------------- quantidade / capital por ativo
/** Quantidade reconstruída ao fim do mês (só lançamentos datados; pendentes ficam fora). */
export function quantidadeAte(ix: Indices, invId: string, ano: number, mes: number): number | null {
  const inv = ix.invPorId.get(invId)
  if (!inv || !CATEGORIAS_COM_QUANTIDADE.includes(inv.categoria)) return null
  const lim = fimDoMes(ano, mes)
  let q = 0
  let algum = false
  for (const m of ix.movPorInv.get(invId) ?? []) {
    if (!m.data || m.data > lim || m.situacao === 'pendente' || m.quantidade == null) continue
    algum = true
    if (m.tipo === 'compra' || m.tipo === 'bonificacao') q += m.quantidade
    else if (m.tipo === 'venda' || m.tipo === 'evento') q -= m.quantidade
  }
  return algum ? Math.round(q * 1e8) / 1e8 : null
}

/** Capital líquido aplicado até o fim do mês: Σ entradas − Σ saídas (compras/aplicações − vendas/resgates/amortizações). */
export function capitalLiquidoAte(ix: Indices, invId: string, ano: number, mes: number): number | null {
  const lim = fimDoMes(ano, mes)
  let v = 0
  let algum = false
  for (const m of ix.movPorInv.get(invId) ?? []) {
    if (!m.data || m.data > lim || m.situacao === 'pendente' || m.valor == null) continue
    if (TIPOS_ENTRADA.includes(m.tipo)) { v += m.valor; algum = true }
    else if (TIPOS_SAIDA.includes(m.tipo)) { v -= m.valor; algum = true }
  }
  return algum ? r2(v) : null
}

/** Resultado realizado acumulado (vendas + resgates + amortizações + proventos − compras − aplicações − taxas), sem valor de mercado. */
export function resultadoRealizado(ix: Indices, invId: string): { valor: number; aplicado: number; recebido: number; proventos: number } {
  let aplicado = 0, recebido = 0, proventos = 0
  for (const m of ix.movPorInv.get(invId) ?? []) {
    if (m.situacao === 'pendente' || m.valor == null) continue
    if (TIPOS_ENTRADA.includes(m.tipo)) aplicado += m.valor + (m.taxas ?? 0)
    else if (TIPOS_SAIDA.includes(m.tipo)) recebido += m.valor - (m.taxas ?? 0)
    else if (m.tipo === 'provento') proventos += m.valor
    else if (m.tipo === 'taxa' || m.tipo === 'imposto') aplicado += m.valor
  }
  return { valor: r2(recebido + proventos - aplicado), aplicado: r2(aplicado), recebido: r2(recebido), proventos: r2(proventos) }
}

// ---------------------------------------------------------------- ativos vigentes num mês
function primeiroMesConhecido(ix: Indices, inv: Investimento): string | null {
  const datas: string[] = []
  if (inv.dataInicio) datas.push(inv.dataInicio.slice(0, 7))
  for (const m of ix.movPorInv.get(inv.id) ?? []) if (m.data) datas.push(m.data.slice(0, 7))
  for (const k of ix.posPorInv.get(inv.id)?.keys() ?? []) datas.push(k)
  return datas.length ? datas.sort()[0] : null
}
function ultimoMesConhecido(ix: Indices, inv: Investimento): string | null {
  if (inv.situacao === 'encerrado' && inv.dataEncerramento) return inv.dataEncerramento.slice(0, 7)
  if (inv.situacao === 'encerrado') {
    const datas: string[] = []
    for (const m of ix.movPorInv.get(inv.id) ?? []) if (m.data) datas.push(m.data.slice(0, 7))
    for (const k of ix.posPorInv.get(inv.id)?.keys() ?? []) datas.push(k)
    return datas.length ? datas.sort().at(-1)! : null
  }
  return null
}

/** Um ativo é vigente no mês se já existia (início conhecido ≤ mês) e ainda não tinha sido encerrado antes do mês. */
export function vigenteNoMes(ix: Indices, inv: Investimento, ano: number, mes: number): boolean {
  const k = chaveMes(ano, mes)
  const ini = primeiroMesConhecido(ix, inv)
  if (!ini || ini > k) return false
  const fim = ultimoMesConhecido(ix, inv)
  return !fim || fim >= k
}

// ---------------------------------------------------------------- posição da carteira no fechamento
export interface SaldoCarteira {
  valor: number | null
  fonte: 'consolidado' | 'soma_ativos' | null
  situacao: 'informada' | 'confirmada' | 'estimada' | null
  dataPosicao: string | null
  /** nomes dos ativos vigentes sem saldo informado (quando fonte = soma_ativos ou null). */
  faltando: string[]
  origem: string | null
}

export function saldoCarteira(b: Base, ix: Indices, ano: number, mes: number): SaldoCarteira {
  const k = chaveMes(ano, mes)
  const cons = ix.consCarteira.get(k)
  if (cons) return { valor: cons.saldo, fonte: 'consolidado', situacao: cons.situacao === 'pendente' ? 'estimada' : cons.situacao, dataPosicao: cons.dataPosicao, faltando: [], origem: cons.origem }
  let soma = 0
  let algum = false
  let pior: SaldoCarteira['situacao'] = 'confirmada'
  let data: string | null = null
  const faltando: string[] = []
  for (const inv of b.investimentos) {
    const p = ix.posPorInv.get(inv.id)?.get(k)
    if (p && p.saldo != null) {
      soma += p.saldo; algum = true
      if (p.situacao === 'estimada') pior = 'estimada'
      else if (p.situacao !== 'confirmada' && pior !== 'estimada') pior = 'informada'
      if (p.dataPosicao && (!data || p.dataPosicao > data)) data = p.dataPosicao
    } else if (vigenteNoMes(ix, inv, ano, mes) && inv.situacao === 'ativo') {
      // ativo vigente sem saldo: pendência (ativos "revisar" não bloqueiam; aparecem nas pendências)
      faltando.push(inv.nome)
    }
  }
  if (!algum) return { valor: null, fonte: null, situacao: null, dataPosicao: null, faltando, origem: null }
  if (faltando.length) return { valor: null, fonte: 'soma_ativos', situacao: null, dataPosicao: data, faltando, origem: null }
  const fech = ix.fechamentos.get(k)
  return { valor: r2(soma), fonte: 'soma_ativos', situacao: fech?.status === 'confirmado' ? 'confirmada' : pior, dataPosicao: data, faltando: [], origem: null }
}

// ---------------------------------------------------------------- resumo mensal da carteira
export interface ResumoMes {
  ano: number
  mes: number
  saldoInicial: number | null
  saldoFinal: number | null
  /** entradas de dinheiro novo (aplicações/compras externas) */
  aportes: number | null
  /** saídas de dinheiro (resgates/vendas externas) */
  resgates: number | null
  /** aportes − resgates do mês (dinheiro novo entrando ou saindo da carteira) */
  aportesLiquidos: number | null
  aportesFonte: 'consolidado' | 'financas' | 'movimentacoes' | null
  /** false quando só o líquido é conhecido (aportes e resgates são o líquido positivo/negativo) */
  aportesBrutos: boolean
  proventos: number | null
  proventosSituacao: 'informado' | 'estimado' | null
  /** saldoFinal − saldoInicial − aportesLiquidos + ajuste (+ proventos fora da posição nos meses manuais) */
  resultado: number | null
  variacaoSaldo: number | null
  rentabilidade: number | null
  ajuste: number | null
  situacao: 'completo' | 'parcial' | 'sem_registros'
  pendencias: string[]
  saldoFinalInfo: SaldoCarteira
  fechamento: Fechamento | null
  movimentacoes: number
  /** compras/vendas internas (financiadas por outro investimento) no mês */
  internos: number
  naoInformados: number
}

export function resumoMes(b: Base, ix: Indices, ano: number, mes: number): ResumoMes {
  const k = chaveMes(ano, mes)
  const [aa, ma] = mesAnterior(ano, mes)
  const fim = saldoCarteira(b, ix, ano, mes)
  const ini = saldoCarteira(b, ix, aa, ma)
  const fluxo = ix.fluxos.get(k) ?? null
  const fech = ix.fechamentos.get(k) ?? null
  const movs = (ix.movPorMes.get(k) ?? []).filter((m) => m.situacao !== 'pendente')
  const pend: string[] = []

  let aportes: number | null = null, resgates: number | null = null, liq: number | null = null, fonte: ResumoMes['aportesFonte'] = null
  let ext = 0, sai = 0, internos = 0, naoInf = 0, provFora = 0
  let brutos = false
  for (const m of movs) {
    if (m.valor == null) continue
    if (m.tipo === 'provento' && m.foraDaPosicao) provFora += m.valor
    if (!TIPOS_ENTRADA.includes(m.tipo) && !TIPOS_SAIDA.includes(m.tipo)) continue
    if (m.origemRecurso === 'externo') { if (TIPOS_ENTRADA.includes(m.tipo)) ext += m.valor; else sai += m.valor }
    else if (m.origemRecurso === 'interno') internos++
    else naoInf++
  }
  if (fluxo && fluxo.aportesLiquidos != null) {
    liq = fluxo.aportesLiquidos
    fonte = fluxo.origem?.startsWith('financas') ? 'financas' : 'consolidado'
    aportes = Math.max(liq, 0); resgates = Math.max(-liq, 0)
    // quando há movimentações externas registradas cujo líquido bate com o fluxo, detalha entradas e saídas brutas
    if ((ext || sai) && Math.abs(ext - sai - liq) < 0.01) { aportes = r2(ext); resgates = r2(sai); brutos = true }
  } else if (fech?.movimentacoesConfirmadas) {
    aportes = r2(ext); resgates = r2(sai); liq = r2(ext - sai); fonte = 'movimentacoes'; brutos = true
    if (naoInf) pend.push(`${naoInf} movimentação(ões) sem origem do recurso informada (externo/interno)`)
  } else if (movs.length) {
    aportes = r2(ext); resgates = r2(sai); fonte = 'movimentacoes'
    pend.push('Movimentações do mês ainda não confirmadas')
  } else if (fim.valor != null && ini.valor != null) {
    pend.push('Movimentações do mês ainda não confirmadas')
  }
  if (ini.valor == null) pend.push(ini.faltando.length ? `Falta o saldo inicial (${ini.faltando.length} ativo(s) sem posição em ${chaveMes(aa, ma)})` : 'Falta o saldo inicial')
  if (fim.valor == null) pend.push(fim.faltando.length ? `Falta o saldo final: ${fim.faltando.slice(0, 4).join(', ')}${fim.faltando.length > 4 ? '…' : ''}` : 'Falta o saldo final')

  const proventos = fluxo?.proventos != null ? fluxo.proventos : (movs.some((m) => m.tipo === 'provento') ? r2(movs.filter((m) => m.tipo === 'provento').reduce((s, m) => s + (m.valor ?? 0), 0)) : null)
  const ajuste = fluxo?.ajuste ?? null
  let resultado: number | null = null
  let rentabilidade: number | null = null
  const podeApurar = ini.valor != null && fim.valor != null && liq != null && !pend.some((p) => p.startsWith('Movimentações'))
  if (podeApurar) {
    // nos meses com fluxo consolidado, proventos já estão dentro da variação do saldo;
    // nos meses manuais, proventos pagos fora da posição somam ao resultado.
    resultado = r2(fim.valor! - ini.valor! - liq! + (ajuste ?? 0) + (fluxo ? 0 : provFora))
    const den = ini.valor! + Math.max(liq!, 0)
    rentabilidade = den > 0 ? resultado / den : null
  }
  const temAlgo = fim.valor != null || movs.length > 0 || fluxo != null || fech != null || fim.faltando.length < b.investimentos.filter((i) => vigenteNoMes(ix, i, ano, mes) && i.situacao === 'ativo').length
  const situacao: ResumoMes['situacao'] = !temAlgo ? 'sem_registros' : podeApurar ? 'completo' : 'parcial'
  return {
    ano, mes, saldoInicial: ini.valor, saldoFinal: fim.valor, aportes, resgates, aportesLiquidos: liq, aportesFonte: fonte, aportesBrutos: brutos,
    proventos, proventosSituacao: fluxo?.proventosSituacao ?? (proventos != null ? 'informado' : null), resultado,
    variacaoSaldo: ini.valor != null && fim.valor != null ? r2(fim.valor - ini.valor) : null, rentabilidade, ajuste,
    situacao, pendencias: pend, saldoFinalInfo: fim, fechamento: fech, movimentacoes: movs.length, internos, naoInformados: naoInf,
  }
}

// ---------------------------------------------------------------- resumo anual
export interface ResumoAno {
  ano: number
  meses: ResumoMes[]
  aportes: number
  resgates: number
  proventos: number
  resultado: number | null
  mesesComResultado: number
  rentabilidade: number | null
  /** posição de encerramento disponível (último fechamento conhecido do ano) */
  carteiraFim: { valor: number; mes: number } | null
  carteiraInicio: number | null
}

export function resumoAno(b: Base, ix: Indices, ano: number): ResumoAno {
  const meses = Array.from({ length: 12 }, (_, i) => resumoMes(b, ix, ano, i + 1))
  const conhecidos = meses.filter((m) => m.resultado != null)
  const soma = (f: (m: ResumoMes) => number | null) => r2(meses.reduce((s, m) => s + (f(m) ?? 0), 0))
  let rent: number | null = null
  if (conhecidos.length === 12 && meses.every((m) => m.rentabilidade != null)) rent = meses.reduce((p, m) => p * (1 + m.rentabilidade!), 1) - 1
  const ultimo = [...meses].reverse().find((m) => m.saldoFinal != null)
  return {
    ano, meses, aportes: soma((m) => m.aportes), resgates: soma((m) => m.resgates), proventos: soma((m) => m.proventos),
    resultado: conhecidos.length ? r2(conhecidos.reduce((s, m) => s + m.resultado!, 0)) : null, mesesComResultado: conhecidos.length,
    rentabilidade: rent, carteiraFim: ultimo ? { valor: ultimo.saldoFinal!, mes: ultimo.mes } : null, carteiraInicio: meses[0].saldoInicial,
  }
}

// ---------------------------------------------------------------- por ativo num mês
export interface LinhaAtivoMes {
  inv: Investimento
  saldoInicial: number | null
  saldoFinal: number | null
  posicao: Posicao | null
  posicaoAnterior: Posicao | null
  aplicacoes: number
  resgates: number
  proventos: number
  taxas: number
  resultado: number | null
  quantidadeInicial: number | null
  quantidadeFinal: number | null
  capitalLiquido: number | null
  movimentacoes: Movimentacao[]
  situacao: 'confirmada' | 'informada' | 'estimada' | 'pendente' | 'sem_avaliacao' | 'encerrado'
  motivo: string | null
}

export function linhasAtivosMes(b: Base, ix: Indices, ano: number, mes: number): LinhaAtivoMes[] {
  const k = chaveMes(ano, mes)
  const [aa, ma] = mesAnterior(ano, mes)
  const ka = chaveMes(aa, ma)
  const out: LinhaAtivoMes[] = []
  for (const inv of b.investimentos) {
    const p = ix.posPorInv.get(inv.id)?.get(k) ?? null
    const pa = ix.posPorInv.get(inv.id)?.get(ka) ?? null
    const movs = (ix.movPorInv.get(inv.id) ?? []).filter((m) => m.ano === ano && m.mes === mes)
    const qIni = quantidadeAte(ix, inv.id, aa, ma)
    const qFim = quantidadeAte(ix, inv.id, ano, mes)
    const vig = vigenteNoMes(ix, inv, ano, mes)
    const comQtd = CATEGORIAS_COM_QUANTIDADE.includes(inv.categoria)
    // ativos com quantidade: só entram se tinham unidades no início/fim do mês ou movimentação; os demais, se vigentes
    const tem = p || pa?.saldo != null || movs.length || (qIni != null && qIni !== 0) || (qFim != null && qFim !== 0) || (vig && !comQtd)
    if (!tem) continue
    // ativo encerrado antes deste mês, sem posição nem movimentação aqui: fica de fora (sobras de quantidade são pendências, não posição)
    if (inv.situacao === 'encerrado' && inv.dataEncerramento && inv.dataEncerramento.slice(0, 7) < k && !p && !movs.length) continue
    let apl = 0, res = 0, prov = 0, tax = 0, provFora = 0
    for (const m of movs) {
      if (m.situacao === 'pendente' || m.valor == null) continue
      if (TIPOS_ENTRADA.includes(m.tipo)) apl += m.valor
      else if (TIPOS_SAIDA.includes(m.tipo)) res += m.valor
      else if (m.tipo === 'provento') { prov += m.valor; if (m.foraDaPosicao) provFora += m.valor }
      else if (m.tipo === 'taxa' || m.tipo === 'imposto') tax += m.valor
      tax += m.taxas ?? 0
    }
    const sIni = pa?.saldo ?? (inv.situacao === 'encerrado' && inv.dataEncerramento && inv.dataEncerramento.slice(0, 7) < k ? 0 : null)
    const sFim = p?.saldo ?? (inv.situacao === 'encerrado' && inv.dataEncerramento && inv.dataEncerramento.slice(0, 7) <= k ? 0 : null)
    const encerradoNoMes = inv.dataEncerramento?.slice(0, 7) === k
    // saldo inicial de ativo adquirido no mês = 0 (nada antes); saldo final de ativo totalmente vendido no mês = 0
    const primeiraMov = (ix.movPorInv.get(inv.id) ?? []).find((m) => m.data)?.data?.slice(0, 7)
    // quantidade reconstruída zero = nada em carteira (saldo 0 conhecido)
    const sIni2 = sIni ?? (primeiraMov === k ? 0 : comQtd && qIni === 0 ? 0 : null)
    const sFim2 = sFim ?? (encerradoNoMes ? 0 : comQtd && qFim === 0 ? 0 : null)
    const capital = capitalLiquidoAte(ix, inv.id, ano, mes)
    let resultado: number | null = null
    if (sIni2 != null && sFim2 != null && (p || pa || encerradoNoMes || primeiraMov === k || (comQtd && qIni === 0 && qFim === 0))) resultado = r2(sFim2 - sIni2 - apl + res + provFora - tax)
    let situacao: LinhaAtivoMes['situacao']
    let motivo: string | null = null
    if (p?.saldo != null) situacao = p.situacao
    else if (sFim2 === 0 && (inv.situacao === 'encerrado' || (comQtd && qFim === 0))) situacao = 'encerrado'
    else if (comQtd && qFim != null) { situacao = 'sem_avaliacao'; motivo = 'Quantidade conhecida; valor de mercado do mês não registrado' }
    else if (!comQtd && capital != null && capital > 0 && !ix.fechamentos.get(k)) { situacao = 'sem_avaliacao'; motivo = 'Capital aplicado conhecido; valor de mercado do mês não registrado' }
    else { situacao = 'pendente'; motivo = 'Saldo do mês não informado' }
    out.push({
      inv, saldoInicial: sIni2, saldoFinal: sFim2, posicao: p, posicaoAnterior: pa, aplicacoes: r2(apl), resgates: r2(res), proventos: r2(prov), taxas: r2(tax),
      resultado, quantidadeInicial: qIni, quantidadeFinal: qFim, capitalLiquido: capital, movimentacoes: movs, situacao, motivo,
    })
  }
  return out.sort((x, y) => x.inv.categoria.localeCompare(y.inv.categoria) || x.inv.nome.localeCompare(y.inv.nome))
}

// ---------------------------------------------------------------- patrimônio total
export interface Patrimonio {
  ano: number
  mes: number
  investimentos: number | null
  investimentosInfo: SaldoCarteira
  contas: number | null
  contasDetalhe: { conta: Conta; saldo: number; data: string | null }[]
  bens: number
  bensDetalhe: { bem: Bem; avaliacao: AvaliacaoBem | null; participacao: number }[]
  imoveis: number
  veiculos: number
  outrosBens: number
  dividas: number
  dividasDetalhe: { divida: Divida; saldo: SaldoDivida | null }[]
  bruto: number | null
  liquido: number | null
  cobertura: { investimentos: boolean; contas: boolean; bens: boolean; dividas: boolean }
  /** quantos bens/dívidas/contas cadastrados ainda não têm valor neste mês */
  semValor: { contas: number; bens: number; dividas: number }
  dataReferencia: string | null
}

/**
 * Conta encerrada ou dívida quitada continua no histórico até a data informada; sem data, até o último
 * saldo registrado. Antes, a simples mudança de situação apagava o item de TODOS os meses passados.
 */
function encerradoAte(data: string | null | undefined, ultimoMesComSaldo: string | null, ano: number, mes: number): boolean {
  if (data) return data <= fimDoMes(ano, mes)
  return ultimoMesComSaldo == null || ultimoMesComSaldo < chaveMes(ano, mes)
}
/** A conta compõe o patrimônio no mês? (ativa, ou encerrada depois dele) */
export function contaVigente(b: Base, c: Conta, ano: number, mes: number): boolean {
  if (c.ativo) return true
  const ultimo = b.saldosConta.filter((s) => s.contaId === c.id).map((s) => chaveMes(s.ano, s.mes)).sort().at(-1) ?? null
  return !encerradoAte(c.dataEncerramento, ultimo, ano, mes)
}
/** A dívida é descontada no mês? (ativa, ou quitada depois dele) */
export function dividaVigente(b: Base, d: Divida, ano: number, mes: number): boolean {
  if (d.situacao === 'ativa') return true
  const ultimo = b.saldosDivida.filter((s) => s.dividaId === d.id).map((s) => s.data.slice(0, 7)).sort().at(-1) ?? null
  return !encerradoAte(d.dataQuitacao, ultimo, ano, mes)
}

export function patrimonioEm(b: Base, ix: Indices, ano: number, mes: number): Patrimonio {
  const lim = fimDoMes(ano, mes)
  const k = chaveMes(ano, mes)
  const inv = saldoCarteira(b, ix, ano, mes)
  let contas = 0, temConta = false
  const contasDetalhe: Patrimonio['contasDetalhe'] = []
  let semConta = 0
  for (const c of b.contas.filter((c) => contaVigente(b, c, ano, mes))) {
    const s = b.saldosConta.filter((s) => s.contaId === c.id && chaveMes(s.ano, s.mes) <= k).sort((x, y) => chaveMes(y.ano, y.mes).localeCompare(chaveMes(x.ano, x.mes)))[0]
    if (s) { contas += s.saldo; temConta = true; contasDetalhe.push({ conta: c, saldo: s.saldo, data: s.data ?? `${chaveMes(s.ano, s.mes)}` }) } else semConta++
  }
  let bens = 0, imoveis = 0, veiculos = 0, outros = 0, semBem = 0
  const bensDetalhe: Patrimonio['bensDetalhe'] = []
  for (const bem of b.bens) {
    if (bem.dataAquisicao && bem.dataAquisicao > lim) continue
    if (bem.situacao === 'vendido' && bem.dataVenda && bem.dataVenda <= lim) continue
    const av = b.avaliacoesBem.filter((a) => a.bemId === bem.id && a.data <= lim).sort((x, y) => y.data.localeCompare(x.data))[0] ?? null
    const base = av?.valor ?? (bem.valorAquisicao != null ? bem.valorAquisicao : null)
    if (base == null) { semBem++; bensDetalhe.push({ bem, avaliacao: null, participacao: 0 }); continue }
    const part = r2(base * bem.percentualPropriedade)
    bens += part
    if (bem.categoria === 'imovel') imoveis += part; else if (bem.categoria === 'veiculo') veiculos += part; else outros += part
    bensDetalhe.push({ bem, avaliacao: av, participacao: part })
  }
  let dividas = 0, semDiv = 0
  const dividasDetalhe: Patrimonio['dividasDetalhe'] = []
  for (const d of b.dividas.filter((d) => dividaVigente(b, d, ano, mes))) {
    if (d.dataInicio && d.dataInicio > lim) continue
    const s = b.saldosDivida.filter((s) => s.dividaId === d.id && s.data <= lim).sort((x, y) => y.data.localeCompare(x.data))[0] ?? null
    if (s) { dividas += s.saldoDevedor; dividasDetalhe.push({ divida: d, saldo: s }) } else { semDiv++; dividasDetalhe.push({ divida: d, saldo: null }) }
  }
  const temBens = bensDetalhe.some((x) => x.avaliacao || x.participacao)
  const bruto = inv.valor == null && !temConta && !temBens ? null : (inv.valor ?? 0) + contas + bens
  const datas = [inv.dataPosicao, ...bensDetalhe.map((x) => x.avaliacao?.data ?? null), ...dividasDetalhe.map((x) => x.saldo?.data ?? null), ...contasDetalhe.map((x) => x.data)].filter((x): x is string => !!x)
  return {
    ano, mes, investimentos: inv.valor, investimentosInfo: inv, contas: temConta ? r2(contas) : null, contasDetalhe, bens: r2(bens), bensDetalhe,
    imoveis: r2(imoveis), veiculos: r2(veiculos), outrosBens: r2(outros), dividas: r2(dividas), dividasDetalhe,
    bruto: bruto == null ? null : r2(bruto), liquido: bruto == null ? null : r2(bruto - dividas),
    cobertura: { investimentos: inv.valor != null, contas: temConta, bens: temBens, dividas: dividasDetalhe.length > 0 && semDiv === 0 },
    semValor: { contas: semConta, bens: semBem, dividas: semDiv }, dataReferencia: datas.length ? datas.sort().at(-1)! : null,
  }
}

// ---------------------------------------------------------------- linha do tempo
export function mesesDisponiveis(b: Base): { primeiro: string; ultimo: string; comDados: Set<string> } {
  const s = new Set<string>()
  for (const p of b.posicoesConsolidadas) if (p.escopo === 'carteira') s.add(chaveMes(p.ano, p.mes))
  for (const p of b.posicoes) if (p.saldo != null) s.add(chaveMes(p.ano, p.mes))
  for (const m of b.movimentacoes) if (m.ano && m.mes) s.add(chaveMes(m.ano, m.mes))
  for (const f of b.fluxosConsolidados) s.add(chaveMes(f.ano, f.mes))
  for (const f of b.fechamentos) s.add(chaveMes(f.ano, f.mes))
  for (const x of b.saldosConta) s.add(chaveMes(x.ano, x.mes))
  for (const x of b.saldosDivida) s.add(chaveMes(x.ano, x.mes))
  for (const x of b.avaliacoesBem) s.add(x.data.slice(0, 7))
  const ord = [...s].sort()
  const hoje = new Date()
  const atual = chaveMes(hoje.getFullYear(), hoje.getMonth() + 1)
  return { primeiro: ord[0] ?? atual, ultimo: ord.at(-1) && ord.at(-1)! > atual ? ord.at(-1)! : atual, comDados: s }
}

export function listaMeses(de: string, ate: string): [number, number][] {
  const out: [number, number][] = []
  let [a, m] = de.split('-').map(Number)
  const [a2, m2] = ate.split('-').map(Number)
  while (cmp(a, m, a2, m2) <= 0) { out.push([a, m]); if (m === 12) { a++; m = 1 } else m++ }
  return out
}

/** Último mês com fechamento consolidado conhecido. */
export function ultimoFechamento(b: Base, ix: Indices): [number, number] | null {
  const { primeiro, ultimo } = mesesDisponiveis(b)
  const meses = listaMeses(primeiro, ultimo).reverse()
  for (const [a, m] of meses) if (saldoCarteira(b, ix, a, m).valor != null) return [a, m]
  return null
}

/** Série mensal do patrimônio para gráficos; meses sem fechamento ficam com null (sem interpolar). */
export function seriePatrimonio(b: Base, ix: Indices, de: string, ate: string): (Patrimonio & { chave: string })[] {
  return listaMeses(de, ate).map(([a, m]) => ({ ...patrimonioEm(b, ix, a, m), chave: chaveMes(a, m) }))
}

/** Composição dos investimentos por categoria e instituição no mês (usa posições por ativo; consolidadas por categoria quando existem). */
export function composicaoInvestimentos(b: Base, ix: Indices, ano: number, mes: number): { porCategoria: { nome: string; valor: number; fonte: 'ativos' | 'categoria' }[]; porInstituicao: { nome: string; valor: number }[]; cobre: number | null } {
  const k = chaveMes(ano, mes)
  const cat = new Map<string, { valor: number; fonte: 'ativos' | 'categoria' }>()
  const instit = new Map<string, number>()
  let total = 0
  for (const inv of b.investimentos) {
    const p = ix.posPorInv.get(inv.id)?.get(k)
    if (!p || p.saldo == null) continue
    const c = cat.get(inv.categoria) ?? { valor: 0, fonte: 'ativos' as const }
    c.valor += p.saldo; cat.set(inv.categoria, c)
    const i = inv.instituicao ?? 'Não informada'
    instit.set(i, (instit.get(i) ?? 0) + p.saldo)
    total += p.saldo
  }
  for (const c of ix.consCategoria.get(k) ?? []) {
    const nome = c.categoria ?? 'Outros'
    if (!cat.has(nome)) { cat.set(nome, { valor: c.saldo, fonte: 'categoria' }); total += c.saldo; instit.set('Não informada', (instit.get('Não informada') ?? 0) + c.saldo) }
  }
  return {
    porCategoria: [...cat].map(([nome, v]) => ({ nome, valor: r2(v.valor), fonte: v.fonte })).sort((x, y) => y.valor - x.valor),
    porInstituicao: [...instit].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((x, y) => y.valor - x.valor),
    cobre: total ? r2(total) : null,
  }
}

export type { CategoriaInvestimento }
