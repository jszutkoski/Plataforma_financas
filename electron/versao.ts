/** Funções puras da atualização (testáveis sem o Electron). */

/** Compara "1.4.0" com "v1.10.2": negativo se a < b, zero se iguais, positivo se a > b. */
export function compararVersoes(a: string, b: string): number {
  const p = (v: string) => v.trim().replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Linha "<sha256>  <arquivo>" (formato do sha256sum) → hash do arquivo pedido, ou null. */
export function hashDoArquivo(somas: string, arquivo: string): string | null {
  for (const linha of somas.split(/\r?\n/)) {
    const m = linha.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i)
    if (m && m[2].trim() === arquivo) return m[1].toLowerCase()
  }
  return null
}
