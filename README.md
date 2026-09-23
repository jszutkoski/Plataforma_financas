# Finanças — aplicativo de finanças pessoais e patrimônio

Aplicativo de computador (Electron) que reúne em uma janela as duas áreas:

- **Finanças** — fluxo de caixa: renda, gastos, investimentos, saldo do mês, lançamentos, recorrentes, categorias, projetos e importação de extratos.
- **Patrimônio** — posições mensais dos investimentos, patrimônio total (investimentos + contas + bens − dívidas), aportes, proventos e resultado de cada mês e ano.

**Não há servidor.** A interface conversa com o núcleo por IPC, dentro do mesmo processo: nenhuma porta é aberta, nada trafega pela rede e nada sai da máquina. Os dados ficam em dois arquivos SQLite na pasta de dados do usuário.

## Como executar

```bash
npm install
npm start          # compila e abre o aplicativo
npm run dev        # desenvolvimento (Vite com recarga + Electron)
npm test           # testes do núcleo e dos cálculos
npm run typecheck
```

## Onde ficam os dados

| Sistema | Pasta |
|---|---|
| Linux | `~/.config/financas-desktop/dados/` |
| Windows | `%APPDATA%\financas-desktop\dados\` |

Dentro dela: `financas.db`, `patrimonio.db` e `backups/`. Na primeira execução, se existirem bancos dos aplicativos anteriores (`~/financas/data` e `~/patrimonio/data`), eles são copiados para lá — a cópia usa `VACUUM INTO`, que não altera os originais.

Backup pela tela **Dados** de cada seção: JSON (formato para levar a outro computador) ou cópia do `.db`. O diálogo de salvar é o do próprio sistema.

## Estrutura

```
electron/   main.ts (janela, IPC, migração), preload.ts (única ponte com a interface)
core/       financas/ e patrimonio/: db.ts (SQLite) + api.ts (operações) — sem HTTP
shared/     tipos e cálculos puros compartilhados com a interface
src/        interface React: Shell.tsx (casca comum), financas/ e patrimonio/
recursos/   ícone do aplicativo
```

A interface nunca tem acesso a Node: `preload.ts` expõe apenas `chamar(canal, carga)`, restrito aos prefixos `fin:` e `pat:`, mais salvar arquivo e abrir pasta.

## Integração entre as duas seções

Como os dois núcleos vivem no mesmo processo, a ponte é chamada de função direta: o aporte líquido do mês pode ser trazido dos lançamentos de investimento/resgate do Finanças, e uma aplicação/resgate com dinheiro externo registrada no Patrimônio gera o lançamento de caixa correspondente.

## Instaladores

```bash
npm run dist:linux   # AppImage + .deb em release/
npm run dist:win     # instalador NSIS + versão portátil (requer Windows ou CI)
```
