/**
 * Permite rodar no `node --test` os módulos da interface (src/), que usam os aliases do Vite
 * (@fin-shared/…, @fin/…) e imports relativos sem extensão. Uso: node --import ./scripts/testes/aliases.mjs
 */
import { register } from 'node:module'

register('./resolver.mjs', import.meta.url)
