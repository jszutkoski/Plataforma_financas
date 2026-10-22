/** Atualização: comparação de versões e leitura do SHA256SUMS. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararVersoes, hashDoArquivo } from './versao.ts'

test('compara versões numericamente, com ou sem "v"', () => {
  assert.ok(compararVersoes('1.4.0', 'v1.5.0') < 0)
  assert.ok(compararVersoes('1.10.0', '1.9.9') > 0)
  assert.equal(compararVersoes('v1.4.0', '1.4.0'), 0)
  assert.ok(compararVersoes('2.0', '1.99.99') > 0)
})

test('acha o hash do arquivo no SHA256SUMS (e só dele)', () => {
  const h = 'a'.repeat(64), d = 'b'.repeat(64)
  const somas = `${h}  Financas-1.5.0.AppImage\n${d} *financas-desktop_1.5.0_amd64.deb\n`
  assert.equal(hashDoArquivo(somas, 'Financas-1.5.0.AppImage'), h)
  assert.equal(hashDoArquivo(somas, 'financas-desktop_1.5.0_amd64.deb'), d)
  assert.equal(hashDoArquivo(somas, 'Financas-1.4.0.AppImage'), null)
  assert.equal(hashDoArquivo('lixo', 'x'), null)
})
