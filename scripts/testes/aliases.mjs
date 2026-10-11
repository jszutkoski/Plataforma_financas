/**
 * Permite rodar no `node --test` os módulos da interface (src/), que usam os aliases do Vite
 * (@fin-shared/…, @fin/…) e imports relativos sem extensão. Uso: node --import ./scripts/testes/aliases.mjs
 */
import module from 'node:module'
import { resolve } from './resolver.mjs'

// registerHooks (síncrono) existe a partir do Node 22.15; antes disso, register (assíncrono)
if (typeof module.registerHooks === 'function') module.registerHooks({ resolve })
else module.register('./resolver.mjs', import.meta.url)
