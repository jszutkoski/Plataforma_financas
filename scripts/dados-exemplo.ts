/**
 * Gera uma base de exemplo com dados inventados — para experimentar o aplicativo,
 * tirar capturas de tela ou testar uma importação sem usar dados reais.
 *
 *   FINANCAS_DB=/tmp/demo/financas.db PATRIMONIO_DB=/tmp/demo/patrimonio.db node scripts/dados-exemplo.ts
 *
 * Os bancos precisam estar vazios: o script recusa sobrescrever uma base com registros.
 */
import * as financas from '../core/financas/api.ts'
import * as patrimonio from '../core/patrimonio/api.ts'
import type { LancamentoInput, TipoLancamento, Grupo } from '../shared/financas/types.ts'

const ANO = new Date().getFullYear()
const MES_FINAL = new Date().getMonth() + 1
const PRIMEIRO_MES = Math.max(1, MES_FINAL - 7)
const dia = (mes: number, d: number) => `${ANO}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
/** Variação determinística (sem aleatoriedade), para a base sair igual toda vez. */
const oscila = (base: number, mes: number, amplitude: number) => Math.round((base + Math.sin(mes * 1.7) * amplitude) * 100) / 100

interface Modelo { descricao: string; tipo: TipoLancamento; valor: number; grupo: Grupo | null; categoria: string; subcategoria: string | null; dia: number; conta?: string; variacao?: number }

const MENSAIS: Modelo[] = [
  { descricao: 'Salário', tipo: 'receita', valor: 9800, grupo: 'Receita', categoria: 'Salário', subcategoria: 'Salário', dia: 5, conta: 'Conta corrente' },
  { descricao: 'INSS', tipo: 'deducao', valor: 908.86, grupo: 'Dedução', categoria: 'Descontos', subcategoria: 'INSS', dia: 5 },
  { descricao: 'Imposto de renda retido', tipo: 'deducao', valor: 742.4, grupo: 'Dedução', categoria: 'Descontos', subcategoria: 'Imposto de renda', dia: 5 },
  { descricao: 'Aluguel', tipo: 'despesa', valor: 2100, grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Aluguel/Financiamento', dia: 10, conta: 'Conta corrente' },
  { descricao: 'Condomínio', tipo: 'despesa', valor: 480, grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Condomínio', dia: 10 },
  { descricao: 'Energia elétrica', tipo: 'despesa', valor: 185, grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Energia', dia: 14, variacao: 45 },
  { descricao: 'Internet', tipo: 'despesa', valor: 119.9, grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Internet', dia: 15 },
  { descricao: 'Plano de saúde', tipo: 'despesa', valor: 612, grupo: 'Fixas', categoria: 'Saúde', subcategoria: 'Plano de saúde', dia: 12 },
  { descricao: 'Streaming de vídeo', tipo: 'despesa', valor: 55.9, grupo: 'Fixas', categoria: 'Assinaturas', subcategoria: 'Streaming', dia: 8, conta: 'Cartão de crédito' },
  { descricao: 'Telefonia móvel', tipo: 'despesa', valor: 69.9, grupo: 'Fixas', categoria: 'Assinaturas', subcategoria: 'Telefonia', dia: 20 },
  { descricao: 'Academia', tipo: 'despesa', valor: 129, grupo: 'Fixas', categoria: 'Assinaturas', subcategoria: 'Aplicativos', dia: 6 },
  { descricao: 'Aporte mensal', tipo: 'investimento', valor: 900, grupo: 'Investimentos', categoria: 'Aportes', subcategoria: 'Renda fixa', dia: 6, conta: 'Conta corrente' },
]

const VARIAVEIS: Modelo[] = [
  { descricao: 'Supermercado', tipo: 'despesa', valor: 520, grupo: 'Variáveis', categoria: 'Alimentação', subcategoria: 'Supermercado', dia: 3, variacao: 120, conta: 'Cartão de crédito' },
  { descricao: 'Supermercado', tipo: 'despesa', valor: 480, grupo: 'Variáveis', categoria: 'Alimentação', subcategoria: 'Supermercado', dia: 18, variacao: 110, conta: 'Cartão de crédito' },
  { descricao: 'Feira', tipo: 'despesa', valor: 95, grupo: 'Variáveis', categoria: 'Alimentação', subcategoria: 'Supermercado', dia: 11, variacao: 25 },
  { descricao: 'Restaurante', tipo: 'despesa', valor: 148, grupo: 'Variáveis', categoria: 'Alimentação', subcategoria: 'Restaurantes', dia: 22, variacao: 60, conta: 'Cartão de crédito' },
  { descricao: 'Delivery', tipo: 'despesa', valor: 86, grupo: 'Variáveis', categoria: 'Alimentação', subcategoria: 'Delivery', dia: 27, variacao: 40, conta: 'Cartão de crédito' },
  { descricao: 'Combustível', tipo: 'despesa', valor: 310, grupo: 'Variáveis', categoria: 'Transporte', subcategoria: 'Combustível', dia: 9, variacao: 70 },
  { descricao: 'Aplicativo de transporte', tipo: 'despesa', valor: 78, grupo: 'Variáveis', categoria: 'Transporte', subcategoria: 'Aplicativos', dia: 16, variacao: 35 },
  { descricao: 'Farmácia', tipo: 'despesa', valor: 132, grupo: 'Variáveis', categoria: 'Saúde', subcategoria: 'Farmácia', dia: 13, variacao: 55 },
  { descricao: 'Material de limpeza', tipo: 'despesa', valor: 88, grupo: 'Variáveis', categoria: 'Casa', subcategoria: 'Limpeza', dia: 19, variacao: 20 },
  { descricao: 'Cinema', tipo: 'despesa', valor: 76, grupo: 'Adicionais', categoria: 'Lazer', subcategoria: 'Passeios', dia: 24, variacao: 30 },
]

const EVENTUAIS: (Modelo & { mes: number })[] = [
  { mes: PRIMEIRO_MES + 1, descricao: 'Consulta médica', tipo: 'despesa', valor: 320, grupo: 'Variáveis', categoria: 'Saúde', subcategoria: 'Consultas', dia: 17 },
  { mes: PRIMEIRO_MES + 2, descricao: 'Revisão do carro', tipo: 'despesa', valor: 890, grupo: 'Variáveis', categoria: 'Transporte', subcategoria: 'Manutenção', dia: 8 },
  { mes: PRIMEIRO_MES + 3, descricao: 'Tênis de corrida', tipo: 'despesa', valor: 459, grupo: 'Adicionais', categoria: 'Vestuário', subcategoria: 'Calçados', dia: 21, conta: 'Cartão de crédito' },
  { mes: PRIMEIRO_MES + 4, descricao: 'Viagem de fim de semana', tipo: 'despesa', valor: 1240, grupo: 'Adicionais', categoria: 'Lazer', subcategoria: 'Viagens', dia: 14, conta: 'Cartão de crédito' },
  { mes: PRIMEIRO_MES + 5, descricao: 'Reembolso do plano de saúde', tipo: 'receita', valor: 380, grupo: 'Receita', categoria: 'Outras receitas', subcategoria: 'Reembolsos', dia: 23 },
  { mes: PRIMEIRO_MES + 6, descricao: 'Resgate para a revisão do carro', tipo: 'resgate', valor: 700, grupo: 'Investimentos', categoria: 'Resgates', subcategoria: 'Renda fixa', dia: 7 },
  { mes: MES_FINAL, descricao: 'Presente de aniversário', tipo: 'despesa', valor: 210, grupo: 'Adicionais', categoria: 'Outros', subcategoria: 'Presentes', dia: 4, conta: 'Cartão de crédito' },
]

function lanc(m: Modelo, mes: number): LancamentoInput {
  return {
    data: dia(mes, m.dia), descricao: m.descricao, tipo: m.tipo, valor: m.variacao ? oscila(m.valor, mes, m.variacao) : m.valor,
    grupo: m.grupo, categoria: m.categoria, subcategoria: m.subcategoria, conta: m.conta ?? null, formaPagamento: null,
    parcela: null, totalParcelas: null, observacoes: null, origem: 'exemplo', origemArquivo: null,
    diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null,
  }
}

function semearFinancas() {
  const atual = financas.info()
  if (atual.lancamentos > 0) throw new Error('O banco do Finanças já tem lançamentos; use um banco vazio.')
  financas.iniciar()
  for (const nome of ['Conta corrente', 'Cartão de crédito', 'Poupança']) financas.criarConta({ nome, tipo: nome.includes('Cartão') ? 'cartao' : 'conta' })

  let n = 0
  for (let mes = PRIMEIRO_MES; mes <= MES_FINAL; mes++) {
    for (const m of [...MENSAIS, ...VARIAVEIS]) { financas.criarLancamento(lanc(m, mes)); n++ }
  }
  for (const m of EVENTUAIS) { if (m.mes >= PRIMEIRO_MES && m.mes <= MES_FINAL) { financas.criarLancamento(lanc(m, m.mes)); n++ } }

  // uma compra parcelada, com a última parcela caindo no mês atual
  const parcelas = 6
  const inicio = Math.max(PRIMEIRO_MES, MES_FINAL - (parcelas - 1))
  financas.parcelamento({
    base: lanc({ descricao: 'Notebook', tipo: 'despesa', valor: 0, grupo: 'Adicionais', categoria: 'Outros', subcategoria: 'Eletrônicos', dia: 15, conta: 'Cartão de crédito' }, inicio),
    valorTotal: 2400, totalParcelas: parcelas, dataInicio: dia(inicio, 15),
  })
  n += parcelas

  // despesas recorrentes cadastradas (modelo para gerar nos próximos meses)
  financas.criarRecorrencia({ id: '', descricao: 'Aluguel', valor: 2100, tipo: 'despesa', grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Aluguel/Financiamento', conta: 'Conta corrente', formaPagamento: null, dia: 10, inicio: `${ANO}-01`, fim: null, observacoes: null, ativo: true })
  financas.criarRecorrencia({ id: '', descricao: 'Internet', valor: 119.9, tipo: 'despesa', grupo: 'Fixas', categoria: 'Moradia', subcategoria: 'Internet', conta: null, formaPagamento: null, dia: 15, inicio: `${ANO}-01`, fim: null, observacoes: null, ativo: true })

  // um projeto com custos fora do fluxo mensal
  const projeto = financas.criarProjeto({ nome: 'Reforma da cozinha', descricao: 'Obra concluída no primeiro semestre' })
  const custos: [string, string, number, number][] = [
    ['Projeto e medições', 'Mão de obra', 1200, PRIMEIRO_MES],
    ['Armários planejados', 'Material', 8600, PRIMEIRO_MES + 1],
    ['Bancada de granito', 'Material', 3150, PRIMEIRO_MES + 1],
    ['Mão de obra — marceneiro', 'Mão de obra', 2400, PRIMEIRO_MES + 2],
    ['Elétrica e hidráulica', 'Mão de obra', 1850, PRIMEIRO_MES + 2],
    ['Torneira e cuba', 'Material', 720, PRIMEIRO_MES + 3],
  ]
  for (const [descricao, secao, valor, mes] of custos) {
    financas.criarLancamento({ ...lanc({ descricao, tipo: 'despesa', valor, grupo: null, categoria: null as unknown as string, subcategoria: secao, dia: 12 }, mes), categoria: null, foraDoFluxo: true, ledger: projeto.nome })
    n++
  }
  return n
}

function semearPatrimonio() {
  const contagens = patrimonio.info().contagens
  if (contagens.investimentos > 0) throw new Error('O banco do Patrimônio já tem investimentos; use um banco vazio.')

  const conta = patrimonio.criar({ t: 'contas', item: { nome: 'Corretora', instituicao: 'Corretora Exemplo', tipo: 'corretora', financasNome: 'Conta corrente', ativo: true } }) as { id: string }

  const ativos = [
    { nome: 'Tesouro Selic 2029', categoria: 'TesouroDireto', instituicao: 'Tesouro Direto', inicial: 12000, crescimento: 0.009 },
    { nome: 'CDB Liquidez Diária', categoria: 'RendaFixa', instituicao: 'Banco Exemplo', inicial: 8000, crescimento: 0.0085 },
    { nome: 'Fundo de Ações Exemplo', categoria: 'Fundos', instituicao: 'Corretora Exemplo', inicial: 6500, crescimento: 0.014 },
    { nome: 'FII de Papel Exemplo', categoria: 'FII', instituicao: 'Corretora Exemplo', inicial: 4800, crescimento: 0.006 },
  ].map((a) => ({ ...a, id: (patrimonio.criar({ t: 'investimentos', item: { nome: a.nome, categoria: a.categoria, instituicao: a.instituicao, dataInicio: `${ANO - 2}-01-15`, situacao: 'ativo', origem: 'exemplo' } }) as { id: string }).id }))

  // 18 meses de posições, com aporte mensal distribuído entre os ativos
  const meses: [number, number][] = []
  for (let i = 17; i >= 0; i--) {
    const d = new Date(ANO, MES_FINAL - 1 - i, 1)
    meses.push([d.getFullYear(), d.getMonth() + 1])
  }
  const saldos = new Map(ativos.map((a) => [a.id, a.inicial]))
  for (const [ano, mes] of meses) {
    const ultimoDia = new Date(ano, mes, 0).getDate()
    for (const a of ativos) {
      const aporte = a.categoria === 'TesouroDireto' ? 400 : a.categoria === 'RendaFixa' ? 300 : 100
      const anterior = saldos.get(a.id)!
      const rendimento = anterior * (a.crescimento + Math.sin(mes * 1.3) * 0.004)
      const saldo = Math.round((anterior + rendimento + aporte) * 100) / 100
      saldos.set(a.id, saldo)
      patrimonio.criar({ t: 'posicoes', item: { investimentoId: a.id, ano, mes, dataPosicao: `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`, saldo, situacao: 'confirmada', origem: 'exemplo' } })
      patrimonio.criar({ t: 'movimentacoes', item: { investimentoId: a.id, tipo: 'aplicacao', data: `${ano}-${String(mes).padStart(2, '0')}-06`, valor: aporte, origemRecurso: 'externo', contaId: conta.id, situacao: 'confirmada', origem: 'exemplo' } })
    }
    patrimonio.criar({ t: 'fechamentos', item: { ano, mes, status: 'confirmado', movimentacoesConfirmadas: true, observacoes: null } })
  }

  // um bem e a dívida ligada a ele
  const bem = patrimonio.criar({ t: 'bens', item: { nome: 'Apartamento', categoria: 'imovel', dataAquisicao: `${ANO - 4}-03-20`, valorAquisicao: 320000, percentualPropriedade: 0.5, localizacao: 'Cidade Exemplo', area: 72, situacao: 'ativo' } }) as { id: string }
  patrimonio.criar({ t: 'avaliacoesBem', item: { bemId: bem.id, data: `${ANO}-01-31`, valor: 410000, fonte: 'estimativa de mercado' } })
  const divida = patrimonio.criar({ t: 'dividas', item: { nome: 'Financiamento do apartamento', instituicao: 'Banco Exemplo', tipo: 'financiamento', dataInicio: `${ANO - 4}-03-20`, vencimento: `${ANO + 16}-03-20`, bemId: bem.id, situacao: 'ativa' } }) as { id: string }
  let saldoDevedor = 180000
  for (const [ano, mes] of meses.filter((_, i) => i % 3 === 0)) {
    patrimonio.criar({ t: 'saldosDivida', item: { dividaId: divida.id, data: `${ano}-${String(mes).padStart(2, '0')}-05`, ano, mes, saldoDevedor, origem: 'exemplo' } })
    saldoDevedor -= 4200
  }
  return { ativos: ativos.length, meses: meses.length }
}

const nFin = semearFinancas()
const pat = semearPatrimonio()
console.log(`Finanças: ${nFin} lançamentos de exemplo.`)
console.log(`Patrimônio: ${pat.ativos} investimentos com ${pat.meses} meses de posições, 1 bem e 1 dívida.`)
console.log('Dados fictícios — não representam a situação financeira de ninguém.')
