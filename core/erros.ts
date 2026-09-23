/** Erro de aplicação: viaja pelo IPC preservando mensagem e corpo (o mesmo contrato que as respostas HTTP tinham). */
export class ErroApp extends Error {
  corpo: unknown
  constructor(mensagem: string, corpo: unknown = null) {
    super(mensagem)
    this.name = 'ErroApp'
    this.corpo = corpo
  }
}
export const erro = (mensagem: string, corpo?: unknown): never => { throw new ErroApp(mensagem, corpo) }
export const errosDeValidacao = (erros: string[]): never => { throw new ErroApp(erros.join(' '), { erros }) }
