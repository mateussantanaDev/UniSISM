# Smoke Manual — UNISISM

> Checklist de verificação após o bloco de fixes do dia (gap #1–4 + 9 micro-gaps + bug do paciente).
> **Tempo total estimado: 30–40 min.** Marque `[x]` conforme passa.
>
> **Convenção de severidade:**
> - 🔴 **P0** = se falhar, **não é pra subir nem em homologação**.
> - 🟡 **P1** = se falhar, gap não foi entregue de verdade.
> - 🟢 **P2** = se falhar, é só polish (UX degradada, não bloqueia).

---

## 0 · Setup (2 min)

### Backend
```bash
cd backend
# Stop e restart é OBRIGATÓRIO — container.ts mudou.
# Se tiver rodando em background, mata e sobe de novo:
docker compose ps    # confirma postgres/redis/minio up
npm run dev          # vai logar "API rodando em :3333"
```

- [ ] Backend logou `API rodando em http://localhost:3333/v1` sem stack trace
- [ ] `curl http://localhost:3333/v1/health` retorna `{"ok":true}`

### Frontend
```bash
cd frontend
npm run dev          # vai logar "Local: http://localhost:5173"
```

- [ ] Vite subiu sem erro
- [ ] `http://localhost:5173/login` carrega

### Seed (se ainda não tem)
```bash
cd backend
npm run db:seed
```

---

## 1 · 🔴 P0 — Bug crítico do dia

### 1.1 Editar cadastro do paciente NÃO loopa
Era o bug que abriu o dia. Backend retornava shape parcial, frontend quebrava em `paciente.alergias.length`.

- [ ] Login: `SMS-047291` / `12345678`
- [ ] Ir em `/ubs/pacientes`
- [ ] Abrir qualquer paciente
- [ ] Clicar **Editar** no header (botão azul)
- [ ] Mudar 1 campo (ex.: telefone) → **Salvar**

✅ **Esperado:** modal fecha em <2s, header continua mostrando GRUPO, ALERGIAS, CRÔNICAS sem flicker. Sem loop de carregamento.
❌ **Se falhar:** backend ainda na versão velha do `UpdatePacienteUseCase`. Confirma o restart.

---

## 2 · 🟡 P1 — Gaps principais (15 min)

### 2.1 Gap #1 — Banners SMS
Login como `ADM-001` / `12345678`.

- [ ] Menu lateral → **Rede** → **Banners** (`/sms/rede/banners`)
- [ ] Página carrega sem erro 500 nem "Erro 404"
- [ ] **+ Novo banner**: título "Teste smoke", corpo "Conteúdo X", tom CAMPANHA, prioridade 50 → **Salvar**
- [ ] Banner aparece no topo da lista
- [ ] **Editar** → muda `ativo` para false → **Salvar**
- [ ] **Filtrar "Inativos"** → banner aparece
- [ ] **Excluir** → confirmação → banner some

### 2.2 Gap #2 — Recomendações por especialidade
- [ ] Menu → **Rede** → **Recomendações** (`/sms/rede/recomendacoes`)
- [ ] **+ Nova**: especialidade "Cardiologia Smoke", textarea com 3 linhas → **Salvar**
- [ ] Aparece na lista
- [ ] **Editar** → adiciona linha 4 → **Salvar**
- [ ] **Excluir** → some
- [ ] Tentar criar com especialidade duplicada → mensagem "Já existe…"

### 2.3 Gap #3 — Reset de senha do paciente (web)
- [ ] Logout
- [ ] `/recuperar-senha-paciente`
- [ ] CPF `123.456.789-00` → **Enviar**
- [ ] Mensagem genérica de "Se houver conta, enviaremos email" — 204 sempre
- [ ] No log do backend, deve aparecer linha tipo "RECUPERACAO_SENHA_TOKEN_GERADO" com URL
- [ ] Copia o token da URL: `/redefinir?t=<token>`
- [ ] Acessa, nova senha `senhaForte123` → **Redefinir**
- [ ] Vai para login do paciente, loga com nova senha

### 2.4 Gap #4 — TFD Solicitações do App Paciente 🚨
Esse era o crítico — fluxo end-to-end estava quebrado.

**Preparar uma solicitação no app (ou via API):**
```bash
# Login paciente — pega token
TOKEN=$(curl -sX POST http://localhost:3333/v1/paciente-app/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"cpf":"12345678900","senha":"senhaForte123"}' | jq -r '.token // .accessToken')

# Lista viagens disponíveis (pega um viagemId)
curl -sH "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/tfd/viagens | jq '.[0].id'

# Cria solicitação (substitui VIAGEM_ID + ENCAMINHAMENTO_ID)
curl -sX POST http://localhost:3333/v1/paciente-app/tfd/solicitacoes \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "viagemId":"<VIAGEM_ID>",
    "encaminhamentoId":"<ENCAMINHAMENTO_ID>",
    "justificativa":"Smoke test - consulta cardiologia"
  }'
```

**Testar painel TFD:**
- [ ] Login como `ADM-001` (ou usuário com `GESTOR_TFD`)
- [ ] Menu lateral TFD → **Pedidos do App** (atalho `A`)
- [ ] Lista aparece com a solicitação acima em status **AGUARDANDO**
- [ ] Filtros funcionam (status / prioridade / busca por nome)
- [ ] Click no nome do paciente → vai pro detalhe
- [ ] Painel direito mostra `[Aprovar pedido] [Recusar]`
- [ ] **Aprovar** → modal abre, assento vazio → **Confirmar**
- [ ] Toast verde "Pedido aprovado · assento A1 · paciente notificado"
- [ ] Status muda para **APROVADA**, painel agora mostra `[Registrar embarque]`
- [ ] **Registrar embarque** → confirmar → status **EMBARCADA**
- [ ] **Concluir** → confirmar → status **CONCLUIDA**, painel vira read-only

**Validar que paciente recebe notificação:**
```bash
curl -sH "Authorization: Bearer $TOKEN" \
  http://localhost:3333/v1/paciente-app/notificacoes | jq
```
- [ ] Notificações `AGENDADO` (na aprovação) presentes

---

## 3 · 🟢 P2 — Micro-gaps TFD (10 min)

### 3.1 Editar veículo
- [ ] `/tfd/frota/<algumId>` → **Editar** → modal com FormFields
- [ ] Mudar capacidade de 14 → 15 → **Salvar**
- [ ] Cabeçalho atualiza

### 3.2 Excluir veículo (só DEV/ADM)
- [ ] Mesmo veículo → **Excluir** → confirmação
- [ ] Se tem viagens → toast "tem viagens registradas, só pode ser desativado"
- [ ] Se não tem → volta para `/tfd/frota` com toast verde

### 3.3 Editar motorista
- [ ] `/tfd/motoristas/<algumId>` → **Editar**
- [ ] Mudar telefone → **Salvar**
- [ ] Sem alert de validade da CNH alterar (validade só por data)

### 3.4 Excluir motorista
- [ ] Mesma lógica do veículo

### 3.5 Editar viagem
- [ ] `/tfd/viagens/<viagemAgendada>` → **Editar** (só aparece se AGENDADA)
- [ ] Mudar hora de saída → **Salvar**
- [ ] Se tentar em viagem `EM_ANDAMENTO`/`CONCLUIDA`: botão Editar não aparece

### 3.6 Anexar PDF tardio em solicitação TFD
- [ ] `/tfd/solicitacoes/<algum>` → no painel Anexos clicar **+ Anexar**
- [ ] Tipo: EXAME, escolher um PDF de teste
- [ ] **Enviar anexo** → toast "Anexo enviado · scanner antivírus em andamento"
- [ ] Lista de anexos atualiza
- [ ] Após ~30s (ClamAV), `scanStatus` muda de PENDENTE → LIMPO

### 3.7 Baixar comprovante de abastecimento
- [ ] `/tfd/abastecimento` → encontra um com status REALIZADO (que tem `temComprovante`)
- [ ] Coluna de ações → **Baixar Comprovante**
- [ ] Browser inicia download com `Content-Disposition` correto

### 3.8 Detalhe de ajuda de custo
- [ ] `/tfd/ajuda-custo` → clica no protocolo (azul, sublinhado)
- [ ] Vai para `/tfd/ajuda-custo/<id>`
- [ ] Vê itens com totais, status, beneficiário, link para viagem
- [ ] Se PENDENTE: testa Autorizar / Negar
- [ ] Se AUTORIZADA: testa Pagar com upload de comprovante (DEV/ADM)

---

## 4 · Verificação backend isolada (5 min)

Testes diretos via curl. Pega token primeiro:
```bash
TOKEN=$(curl -sX POST http://localhost:3333/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"ADM-001","senha":"12345678"}' | jq -r .token)
```

- [ ] `curl -sH "Authorization: Bearer $TOKEN" http://localhost:3333/v1/admin/sms-banners | jq` → array
- [ ] `curl -sH "Authorization: Bearer $TOKEN" http://localhost:3333/v1/admin/recomendacoes-especialidade | jq` → array
- [ ] `curl -sH "Authorization: Bearer $TOKEN" http://localhost:3333/v1/tfd/solicitacoes-paciente | jq` → array
- [ ] `curl -sH "Authorization: Bearer $TOKEN" -X PATCH http://localhost:3333/v1/pacientes/<algumId> -H 'Content-Type: application/json' -d '{"telefone":"99999999"}' | jq '.alergias | type'` → `"array"` (não `"undefined"`)

---

## 5 · Plano de rollback se algo falhar

### 5.1 Bug do paciente voltou (loopa de novo)
```bash
cd backend
git log --oneline -5         # vê últimos commits
# Se a mudança em UpdatePacienteUseCase + container.ts foi commitada, reverte:
git revert <hash>
# Senão, basta stash:
git stash
npm run dev
```

### 5.2 Tela TFD/Pedidos do App quebra ao abrir
- Verifica se o backend tem as 6 rotas: `curl -i http://localhost:3333/v1/tfd/solicitacoes-paciente -H "Authorization: Bearer $TOKEN"` deve dar 200 ou erro de auth, **nunca 404**
- Se 404: backend está em versão velha. Pull / rebuild.

### 5.3 Banner / Recomendação não salva
- Confirma que os endpoints existem no `app.ts` (montados em `/v1/admin/sms-banners` e `/v1/admin/recomendacoes-especialidade`)

### 5.4 Logs estruturados para investigar
```bash
# Backend imprime pino JSON em stdout, segue:
docker compose logs -f backend | grep -i "error\|EDITAR_PACIENTE\|TFD_PAC"
```

---

## 6 · Sinais verdes finais

- [ ] Todas as caixas P0 e P1 marcadas
- [ ] Nenhum erro 500 em qualquer fluxo testado
- [ ] Backend logs sem stack trace nas últimas 10 min
- [ ] `/v1/health` continua respondendo 200
- [ ] (Opcional) `tail -100 backend/logs/audit.log | grep -c EDITAR_PACIENTE` ≥ 1

Se tudo verde: **deploy autorizado.** 🚀

---

## 7 · Pendências consensadas (NÃO testar agora, ficam pro futuro)

Coisas que sinalizei e ficaram fora desta sessão por decisão sua:

- Bcrypt cost 10 → 12 (segurança)
- Triplo prefixo `/auth/paciente/*` + `/paciente/*` + `/paciente-app/*` (dívida)
- Alias `token` + `accessToken` em login (retrocompat)
- `package.json` backend versão `0.1.0` → alinhar com `CHANGELOG.md` (0.18.x)
- HTMLs ainda hard-coded: `backend/docs/BACKEND_DOCS.html`, `UNISISM-Paciente/DOCS.html`, `UNISISM-motorista/DOCUMENTACAO.html`
- Tela `/tfd/auditoria` sem rota de detalhe (modal já cobre — pulado intencionalmente)

---

**Versão deste checklist:** 1.0 · gerado após fechamento dos gaps #1–4 + 9 micro-gaps TFD + bug `UpdatePacienteUseCase`.
