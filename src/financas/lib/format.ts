import { MESES, MESES_CURTO } from '@fin-shared/types'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlInt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export const fmtBRL = (v: number | null | undefined): string => brl.format(v ?? 0)
export const fmtBRLInt = (v: number | null | undefined): string => brlInt.format(v ?? 0)
export const fmtNum = (v: number): string => num.format(v)
/** Abreviado para eixos: R$ 1,2 mil / R$ 12 mil */
export const fmtCompact = (v: number): string => {
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: a >= 10_000 ? 0 : 1 })} mil`
  return `${s}R$ ${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
export const fmtPct = (v: number, digits = 0): string => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`
export const fmtPctDelta = (v: number): string => `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

/** ISO -> dd/mm/aaaa */
export const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const fmtDataCurta = (iso: string): string => {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}
export const nomeMes = (mes: number): string => MESES[mes - 1] ?? ''
export const nomeMesCurto = (mes: number): string => MESES_CURTO[mes - 1] ?? ''
export const competencia = (ano: number, mes: number): string => `${nomeMes(mes)} de ${ano}`
export const hojeISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Converte "1.234,56" / "1234.56" / "R$ 1.234,56" em número. */
export function parseValorBR(s: string | number | null | undefined): number | null {
  if (s == null || s === '') return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  let t = String(s).trim().replace(/R\$\s?/i, '').replace(/\s/g, '')
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-')
  t = t.replace(/[()-]/g, '')
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/\.\d{1,2}$/.test(t)) t = t.replace(/,/g, '')
  else t = t.replace(/[.,]/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}
/** Aceita dd/mm/aaaa, aaaa-mm-dd, dd-mm-aaaa, Date, serial do Excel. */
export function parseDataBR(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toISO(v)
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)) // serial do Excel
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return valida(+m[1], +m[2], +m[3])
  // dd/mm/aaaa, opcionalmente seguido de hora (extratos costumam trazer "03/04/2024 10:15")
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return valida(y, +m[2], +m[1])
  }
  // datas numéricas em outro formato são ambíguas: o Date do JavaScript as leria como mês/dia
  if (/^\d{1,2}[/.-]\d{1,2}/.test(s)) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : toISO(d)
}
function valida(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
