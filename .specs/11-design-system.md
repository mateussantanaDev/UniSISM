# 11 · Design System — B2G Brutalist

> Resumo executivo do design system. Detalhes completos em
> `frontend/DESIGN_SYSTEM.md` (924 linhas com tokens, componentes,
> padrões de tela e checklist de replicação).

---

## Filosofia

**B2G = Business to Government.** O produto é institucional, passa por
auditoria, é operado sob jornada longa, exibe dados sensíveis. Usuário é
servidor público treinado — não consumidor.

**Mental model**: terminais Bloomberg, painéis Palantir, consoles AWS, NASA
Mission Control. Não é "startup fofa".

## 10 princípios

| # | Princípio | Tradução prática |
|---|---|---|
| P1 | Autoridade institucional | Sans-serif · alto contraste · azul marinho como cor de ação |
| P2 | Densidade informacional | Tela ≈ painel Bloomberg. `text-xs` / `text-[11px]` com `leading-tight` |
| P3 | Cantos retos | Proibido `rounded-*` além de `rounded-sm`. Reset global zera `border-radius` em inputs |
| P4 | Bordas finas, não sombras | Hierarquia por `border-slate-200` + bg, nunca por `shadow-md` difuso |
| P5 | Cores sóbrias | `blue-900` = ação · `slate-*` = neutro · semânticos só em **estado** |
| P6 | Monoespaçada para dados | `font-mono` em protocolos, CPF, datas, IDs, badges. Sans em nomes |
| P7 | Atalhos por teclado | Todo botão primário e aba ganha `<kbd>`. Operador navega com teclado |
| P8 | Sub-rotas sobre modais | Info persistente = rota. Ação pontual = sub-rota ou modal focado |
| P9 | Zero gradiente colorido | Única exceção: `from-white to-slate-50` muito sutil em headers |
| P10 | RBAC visível | UI esconde o que o backend já proíbe via 403/404 |

## Tokens — paleta

### Neutros

| Classe | Uso |
|---|---|
| `bg-slate-50` | Fundo da página |
| `bg-white` | Fundo de painéis e cards |
| `bg-slate-100` | Hover de linhas / botões secundários ativos |
| `border-slate-200` | Borda padrão de containers (1px) |
| `border-slate-300` | Borda de botões secundários e inputs |
| `text-slate-900` | Texto primário |
| `text-slate-700` | Tabelas e corpo |
| `text-slate-600` | Texto secundário |
| `text-slate-500` | Labels (`uppercase tracking-widest`) |
| `text-slate-400` | Placeholders e ícones neutros |

### Ação (institucional)

| Classe | Uso |
|---|---|
| `bg-blue-900` | Botão primário, barra de acento, avatar, badge ativa |
| `text-blue-900` | Links e números de protocolo |
| `bg-blue-50` / `border-blue-700` | Tabs ativas, informativo |

### Semânticos (estado apenas, nunca decorativo)

| Tom | Classes | Uso |
|---|---|---|
| Sucesso | `border-emerald-700 bg-emerald-50 text-emerald-800` | APROVADO, sessão ativa, exame normal |
| Atenção | `border-amber-600 bg-amber-50 text-amber-800` | PENDÊNCIA, PRIORITÁRIA, aguardando |
| Crítico | `border-red-700 bg-red-50 text-red-800` | URGENTE, alergia grave, REJEITADO |
| Neutro escuro | `border-slate-600 bg-slate-50 text-slate-700` | RASCUNHO, ENCERRADA |

**Regra de ouro**: nenhum uso estético de cor. Verde/âmbar/vermelho são
reservados para **estado** — nunca para "decorar".

### Para white-label

Único token customizável por tenant:

```css
/* tenant default */
:root {
  --brand-primary: theme('colors.blue.900');
}

/* tenant custom — sobrescrever em build/CSS */
:root[data-tenant="<tenantId>"] {
  --brand-primary: #1a3a8a;  /* azul próprio */
}
```

Componentes usam `bg-[var(--brand-primary)]` em vez de `bg-blue-900` quando
o branding for variável.

## Tipografia

### Famílias

- `font-sans` → **Inter** (nomes, textos corridos, cabeçalhos)
- `font-mono` → **JetBrains Mono / SF Mono / ui-monospace** (IDs, protocolos, datas, badges, labels uppercase, tabelas)

### Escala (apenas estes tamanhos)

| Tailwind | px | Uso |
|---|---|---|
| `text-[9px]` | 9 | Atalhos de teclado (`<kbd>`) |
| `text-[10px]` | 10 | Labels `uppercase tracking-widest`, badges |
| `text-[11px]` | 11 | Texto auxiliar em painéis densos |
| `text-xs` | 12 | Corpo de tabelas, formulários |
| `text-sm` | 14 | Texto principal, inputs |
| `text-base` | 16 | Títulos de painéis destacados |
| `text-lg` | 18 | Cabeçalho de modal / login |
| `text-xl`–`text-3xl` | 20-30 | Métricas numéricas (`MetricCard`) |

### Features Inter

`font-feature-settings: 'cv02','cv03','cv04','cv11'` — melhora legibilidade
de `0/O` e `1/I/l`. Já configurado globalmente em `app.css`.

### Padrões textuais

- Labels: `text-[10px] font-semibold tracking-widest uppercase`
- Títulos de painéis: `font-mono text-xs font-bold tracking-widest uppercase`
- Dados tabulares: `font-mono text-xs`
- Números grandes: `font-mono text-3xl font-bold tracking-tight`

## Espaçamento

Múltiplos de 4px (padrão Tailwind):

- `gap-px` → divisores 1px em grids
- `gap-1` / `gap-1.5` / `gap-2` → chips, kbd
- `gap-3` → elementos dentro de painel
- `gap-4` → entre painéis

## Componentes recorrentes

| Componente | Função |
|---|---|
| `<MetricCard>` | KPI grande (label + valor + delta opcional) |
| `<DataTable>` | Tabela densa com sort + filtro + paginação |
| `<StatusBadge>` | Pílula de estado (cor semântica + texto curto) |
| `<EmptyState>` | Ícone outline + título + descrição + CTA |
| `<Skeleton>` | Placeholder `bg-slate-100 animate-pulse` |
| `<KbdHint>` | `<kbd>` estilizado com letra/número |
| `<Sidebar>` | Navegação lateral com itens colapsáveis |
| `<HeaderBar>` | Topo: logo · breadcrumb · busca · user menu |
| `<ActionPanel>` | Painel lateral direito de ações (decisão de encaminhamento) |
| `<PdfViewer>` | Visualizador inline (`pdf.js`) |
| `<FormSection>` | Bloco de form com label + descrição + inputs |

## Padrões de tela

### Tela "lista densa" (encaminhamentos, viagens, motoristas)

```
┌─────────────────────────────────────────────────────┐
│ Sidebar │ Header + breadcrumb                       │
│         ├───────────────────────────────────────────┤
│  ...    │ Filtros laterais     │ Tabela densa       │
│         │ (sticky-top)         │ (overflow scroll)  │
│         │                      │                    │
│         │ • Status             │ Protocolo  Data    │
│         │ • Prioridade         │ ...        ...     │
│         │ • UBS                │                    │
│         │ • Data range         │                    │
│         │                      │ [paginação]        │
└─────────┴──────────────────────┴────────────────────┘
```

### Tela "detalhe + ação"

```
┌─────────────────────────────────────────────────────┐
│ Sidebar │ Header + breadcrumb                       │
│         ├───────────────────────────────────────────┤
│  ...    │ Cabeçalho denso (protocolo, paciente)     │
│         ├───────────────────────────────────────────┤
│         │ Timeline (esquerda 70%) │ Painel ação    │
│         │ Anexos (esquerda 70%)   │ (direita 30%)  │
│         │ Dados clínicos          │ [Aprovar A]    │
│         │                         │ [Pendência P]  │
│         │                         │ [Rejeitar R]   │
└─────────┴─────────────────────────┴─────────────────┘
```

## Acessibilidade

- Contraste mínimo WCAG AA (4.5:1 para texto, 3:1 para UI).
- Tab order lógica em toda página.
- `aria-label` em ícones-only.
- Modais com focus trap + ESC fecha.
- Tabelas com `<th scope>` corretos.
- Inputs sempre com `<label>` (ou `aria-labelledby`).

## Anti-patterns (o que NÃO fazer)

- ❌ `rounded-lg`, `rounded-xl`, `rounded-full` (exceto avatar)
- ❌ `shadow-lg`, `shadow-2xl`, `drop-shadow`
- ❌ Gradientes coloridos decorativos
- ❌ Emojis na UI (operacional)
- ❌ `text-base` em corpo de tabela (vira gigante demais)
- ❌ Botão primário com `text-white` em fundo claro (usar `bg-blue-900 text-white`)
- ❌ Cor verde/âmbar/vermelho para "destacar" — só para estado
- ❌ Modal cheio de formulário longo — virar sub-rota
- ❌ Hover effects elaborados — `bg-slate-100` simples basta

## Layout responsivo

- Breakpoints Tailwind padrão: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536.
- Sidebar colapsa para hamburger em `<md`.
- Tabelas densas viram cards empilhados em `<sm`.
- App é desktop-first (operador) mas mobile-functional.

## Checklist antes de submeter UI

- [ ] Sem `rounded-*` além de `rounded-sm` (exceto avatar circular)
- [ ] Sem `shadow-*` difuso
- [ ] Bordas finas presentes
- [ ] Atalhos de teclado em CTA principais
- [ ] Empty / loading / error states cobertos
- [ ] Mobile testado em 360px
- [ ] Tab order lógica
- [ ] Contraste OK
- [ ] Nenhum dado real de cliente exposto (logo, nome, copy)
