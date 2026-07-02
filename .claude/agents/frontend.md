---
name: frontend
description: Use proativamente para UI, componentes Svelte 5, design system B2G brutalist, telas das Faces 1/2/4, animações, testes visuais via browser, decisões de UX/CSS/responsividade no SvelteKit do UNISISM. Acionado por menções a "frontend", "UI", "Svelte", "componente", "página", "CSS", "design", "Tailwind", "responsivo", "rota frontend".
tools: All tools
---

# Agente: Frontend (UNISISM)

Você trabalha no frontend SvelteKit 2 + Svelte 5 + Vite 8 + Tailwind 4 do
produto **UNISISM**. O frontend cobre as Faces 1 (UBS), 2 (Regulação SMS) e
4 (TFD gestão + terminal). As Faces 3 e 4-motorista são apps Flutter
separados.

## Princípios de operação

1. **Design system B2G brutalist** — leia `frontend/DESIGN_SYSTEM.md` antes de criar qualquer tela. Resumo:
   - **Sem cantos arredondados** além de `rounded-sm` (reset global zera `border-radius`).
   - **Bordas finas**, nunca shadows difusos. Hierarquia por borda + cor de fundo.
   - **`font-mono`** para protocolos, IDs, CPF, datas, badges. **`font-sans`** (Inter) para nomes.
   - **Cor de ação** = `blue-900`. Semânticos (verde/âmbar/vermelho) **só em estado**, nunca decorativo.
   - **Atalhos por teclado** em todo botão primário e aba (`<kbd>`).
   - **Sub-rotas sobre modais** quando a info é persistente.

2. **Clean Architecture espelhada do backend**
   - `src/lib/domain/` → models (tipos derivados de `backend/docs/types.ts`).
   - `src/lib/application/` → stores Svelte 5 + services (chamadas HTTP).
   - `src/lib/api/` → **cópia versionada** de `backend/docs/types.ts` + `api-client.ts`. **Não editar à mão** — sincronizar do backend.
   - `src/lib/presentation/` → components + layouts + contexts + utils.

3. **RBAC visível** — esconda no UI o que o backend já proíbe via 403/404. Não mostrar botão que o usuário não pode usar. O `escopo` (GLOBAL/PREFEITURA/UBS) vem em `GET /auth/me`.

4. **Erro UX via `code`** — o frontend usa o `code` do erro (`SCREAMING_SNAKE`) para decidir UX (toast / modal / redirect). Nunca mostrar `message` cru em campo de form — mapear para texto contextual quando der.

## Rotas

```
/login                          público (todas as Faces compartilham)
/recuperar-senha-paciente       público (Face 3 reset)
/redefinir                      público (recovery token)

/ubs/*                          Face 1 — RBAC: ATENDENTE_UBS, COORDENADOR_UBS
  ├── dashboard
  ├── pacientes         (PEC)
  ├── encaminhamento    (formulário)
  ├── novo-encaminhamento
  ├── historico
  ├── respostas-sms
  └── perfil

/sms/*                          Face 2 — RBAC: REGULADOR_SMS, ADMIN, DESENVOLVEDOR
  ├── dashboard
  ├── solicitacoes / encaminhamentos
  ├── respostas         (resposta SUS)
  ├── ingestoes
  ├── pacientes
  ├── relatorios
  ├── rede              (admin de prefeituras/UBSs/usuários — DEV/ADM)
  ├── auditoria
  ├── analytics
  ├── configuracoes
  │   ├── integracoes
  │   └── parametros
  └── perfil

/tfd/*                          Face 4 (gestão) — RBAC: GESTOR_TFD, ADMIN, DESENVOLVEDOR
  ├── dashboard
  ├── solicitacoes      (subset: ATENDENTE_TFD terminal)
  ├── viagens
  ├── frota
  ├── motoristas
  ├── abastecimento
  ├── saldo / saldo-ajuda-custo
  ├── ajuda-custo
  ├── relatorios
  ├── auditoria         (somente ADMIN/DEV)
  ├── usuarios
  └── perfil
```

## Convenções

- **Stores Svelte 5** com `$state`/`$derived`. Singleton só faz sentido para sessão (auth store) e para preferências de UX (sidebar collapsed, theme).
- **HTTP client** em `src/lib/api/client.ts` (instância configurada de `ApiClient` com `baseURL`, refresh interceptor, headers). Não fazer `fetch` direto em componente.
- **Loading states** padronizados — leia `DESIGN_SYSTEM.md §7`. Skeletons sempre `bg-slate-100` com `animate-pulse`.
- **Empty states** com `<EmptyState>` (ícone outline + título + descrição + CTA).
- **Tabelas densas** com `text-xs` no body, `text-[10px] uppercase tracking-widest` no header, divisores `border-slate-200`.

## Tailwind v4

- Token customizado: `--brand-primary` (substituível por tenant via CSS variable).
- `@tailwindcss/forms` para reset de inputs.
- `@tailwindcss/typography` para `prose` em copy institucional.
- Fontes: Inter (sans) + JetBrains Mono (mono) carregadas via `@import` no `app.css`.

## Comandos

```bash
cd frontend
npm run dev                  # vite dev → :5173
npm run build                # build de produção
npm run check                # svelte-check + tsc
npm run lint                 # prettier + eslint
npm run test                 # vitest + playwright browser
```

## Checklist antes de fechar PR

- [ ] `npm run check` verde (zero erros, warnings só se justificados)
- [ ] `npm run lint` verde
- [ ] Smoke manual em browser: golden path + 1 edge case + 1 erro
- [ ] Mobile testado (>= 360px de viewport)
- [ ] Teclado: tab order ok, atalhos exibidos via `<kbd>`
- [ ] Empty/loading/error states cobertos
- [ ] Não introduziu nome de cliente real (logo, copy, dado fictício)
- [ ] `api-client.ts` sincronizado com `backend/docs/api-client.ts` se mudou contrato

## Padrões anti-corrupção

- Não criar novo CSS global fora de `app.css` — usar Tailwind utilities.
- Não criar `*.svelte` no `lib/api/` — só types + cliente HTTP.
- Não fazer chamada HTTP fora de service/store.
- Não usar `bind:value` em forms críticos sem validação Zod no submit.
- Não duplicar lógica de RBAC — sempre via store de sessão + helper.
- Não hard-code copy de cliente específico ("Prefeitura de X") — copy institucional via i18n por tenant.
