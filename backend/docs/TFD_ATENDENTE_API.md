# UNISISM · Face 4 / TFD — Perfil ATENDENTE_TFD (Terminal Rodoviário)

> Documento de bolso para o frontend "Terminal Rodoviário" — UI minimalista
> usada pelos atendentes que ficam na rodoviária recebendo pacientes e
> cadastrando solicitações de viagem TFD. O atendente **não vê** frota,
> motoristas, viagens, abastecimento, saldo, ajudas nem auditoria — só
> solicitações + apoios pra preencher o formulário.

## Os 3 níveis de usuário do TFD

| Role | Escopo | Pode... | NÃO pode... |
|---|---|---|---|
| `GESTOR_TFD` | Prefeitura | tudo do TFD (frota, motoristas, viagens, aprovar/negar solicitações, abastecimento, saldo*, ajudas) | criar Prefeitura/UBS, gerenciar usuários (só ADMIN/DEV), `saldo/ajustar` e `auditoria/*` (só ADMIN/DEV) |
| `ATENDENTE_TFD` (este doc) | Prefeitura | criar solicitação, anexar comprovante, listar suas solicitações, baixar anexos próprios, ver pacientes e UBSs (apoio ao form) | aprovar/negar solicitação, ver/criar viagens, motoristas, abastecimento, saldo, ajudas, auditoria |
| `MOTORISTA_TFD` | App mobile próprio (`/v1/motorista-app/*`) | ver suas viagens, iniciar/concluir, chamada digital de passageiros | qualquer rota `/v1/tfd/*` (módulo diferente) |

> O usuário `ADMIN` da prefeitura e `DESENVOLVEDOR` continuam tendo acesso
> a tudo — eles podem operar como "supergestor TFD" se necessário.

---

## O que o ATENDENTE_TFD enxerga

### Rotas que ele PODE chamar

| Método | Rota | Descrição |
|---|---|---|
| GET | `/v1/auth/me` | Perfil resumido (sidebar) |
| GET | `/v1/me/profile` | Perfil completo (página perfil) |
| POST | `/v1/me/password` | Trocar senha |
| POST | `/v1/auth/logout` | Logout |
| GET | `/v1/pacientes` | Lista pacientes da prefeitura (search por nome/CPF/CSUS) |
| GET | `/v1/pacientes/:id` | Detalhe completo (pra confirmar identidade na rodoviária) |
| GET | `/v1/pacientes/por-cpf/:cpf` | Busca por CPF (pré-preenche form com dados conhecidos) |
| GET | `/v1/admin/ubs` | Lista UBSs da prefeitura (popula o select do form) |
| **GET** | **`/v1/tfd/solicitacoes`** | Lista solicitações da prefeitura (com filtros) |
| **POST** | **`/v1/tfd/solicitacoes`** | **Cria solicitação** (ação principal) |
| **GET** | **`/v1/tfd/solicitacoes/:id`** | Detalhe da solicitação |
| **POST** | **`/v1/tfd/solicitacoes/:id/anexos`** | Anexa comprovante (PDF/JPEG/PNG, máx 10 MB) |
| **GET** | **`/v1/tfd/anexos/:id/download`** | Baixa anexo (após scan ClamAV = LIMPO) |

### Rotas BLOQUEADAS (todas retornam `403 PERMISSAO_INSUFICIENTE`)

- `POST /v1/tfd/solicitacoes/:id/aprovar` · `/negar` — só gestor decide
- Todo `/v1/tfd/veiculos/*`, `/v1/tfd/motoristas/*`, `/v1/tfd/viagens/*`,
  `/v1/tfd/abastecimentos/*`, `/v1/tfd/saldo`, `/v1/tfd/ajudas-custo/*`,
  `/v1/tfd/auditoria/*`
- Todo `/v1/admin/*` exceto `GET /v1/admin/ubs`
- Todo `/v1/encaminhamentos/*`, `/v1/relatorios/*`, `/v1/dashboard/*`

---

## Como o gestor cria um ATENDENTE_TFD

Via UI de admin (ou `POST /v1/admin/usuarios`):

```http
POST /v1/admin/usuarios
Authorization: Bearer <jwt-de-ADMIN-ou-DEV>

{
  "nome": "MARIA RECEPCIONISTA RODOVIÁRIA",
  "email": "maria.rod@aguasbelas.pe.gov.br",
  "matricula": "TFD-001",
  "cpf": "111.222.333-44",
  "senha": "trocarDepois123",
  "role": "ATENDENTE_TFD",
  "prefeituraId": "<uuid-da-prefeitura>",
  "telefone": "(75) 99999-0000",
  "cargo": "Atendente TFD · Terminal Rodoviário"
}
```

**Response 201**: mesmo shape de outros usuários.

**Validações**:

- `prefeituraId` obrigatório (`422 PREFEITURA_OBRIGATORIA` se omitido)
- Criador precisa ter acesso à prefeitura (`403 FORA_DO_ESCOPO`)
- `senha` ≥ 8 chars
- ADMIN só cria na própria prefeitura; DEV em qualquer

Após criar, o atendente pode logar normalmente em `POST /v1/auth/login` com
`matricula` ou `email`. O JWT vem com `role: "ATENDENTE_TFD"` e
`prefeituraId`.

---

## Fluxo completo de cadastro de solicitação

### 1. Atendente busca o paciente (CPF do RG)

```ts
const r = await api.pacientes.porCpf('111.222.333-44');
// r.existe === true → paciente já cadastrado, segue
// r.existe === false → mostrar form "novo paciente" antes da solicitação
```

Se o paciente **não existe** na prefeitura, hoje o ATENDENTE_TFD NÃO tem
endpoint pra cadastrar paciente — encaminhar pra UBS de origem cadastrar
primeiro, OU pedir pra gestor TFD via outro canal. (Roadmap: dar permissão
de cadastro de paciente pra ATENDENTE_TFD se for política da prefeitura.)

### 2. Atendente seleciona a UBS de vínculo (do paciente)

```ts
const ubsList = await api.admin.listUbs();
// → array de { id, nome, prefeitura: { id, nome } }
```

Pré-selecionar a UBS que aparece em `paciente.unidadeVinculada`.

### 3. Atendente preenche dados da viagem e submete

```http
POST /v1/tfd/solicitacoes
Authorization: Bearer <jwt>

{
  "pacienteId": "uuid-paciente",
  "ubsId": "uuid-ubs-de-origem",
  "destino": "Salvador",
  "unidadeDestino": "Hospital Roberto Santos",
  "especialidade": "Cardiologia",
  "motivo": "Avaliação especializada — encaminhada pelo dr. Silva (CRM/BA 12345)",
  "dataDesejada": "2026-06-15",
  "acompanhanteNecessario": true,
  "prioridade": "PRIORITARIA",
  "observacoes": "Paciente cadeirante, precisa de assento adaptado"
}
```

**Response 201**: objeto `Solicitacao` (status = `PENDENTE`).

**Erros comuns**:

| HTTP | code | Quando |
|---|---|---|
| 404 | `UBS_NAO_ENCONTRADA` | ubsId não pertence à prefeitura do atendente |
| 404 | `PACIENTE_NAO_ENCONTRADO` | pacienteId não pertence à prefeitura |
| 400 | `PAYLOAD_INVALIDO` | campos obrigatórios faltando / formato errado |

### 4. (Opcional) Anexa comprovante de encaminhamento

```http
POST /v1/tfd/solicitacoes/:id/anexos
Content-Type: multipart/form-data

file: <PDF do encaminhamento médico>
tipo: COMPROVANTE_ENCAMINHAMENTO
```

**Response 201**: `{ id, nome, tipo, tamanhoKb, scanStatus: "PENDENTE", uploadEm }`.

> O anexo passa por scan ClamAV. Botão de download fica desabilitado até
> `scanStatus === "LIMPO"` (em dev sem ClamAV, vira `LIMPO` em ~1s).

### 5. Atendente entrega o protocolo ao paciente

`solicitacao.protocolo` = `TFD-AAAA-NNNNNN` — anotar/imprimir + entregar.
Quando o gestor TFD aprovar/negar, o paciente é notificado (futuro: SMS,
hoje só consulta).

### 6. Consulta posterior (status da solicitação)

```http
GET /v1/tfd/solicitacoes?status=PENDENTE
GET /v1/tfd/solicitacoes?status=APROVADA
GET /v1/tfd/solicitacoes/:id
```

O atendente vê todas as solicitações da prefeitura (não só as que ele
criou). Útil pra dar resposta presencial: "olha, sua solicitação
TFD-2026-000123 já foi aprovada e está alocada na viagem do dia 15/06".

---

## Filtros úteis na listagem

```http
GET /v1/tfd/solicitacoes?status=PENDENTE
GET /v1/tfd/solicitacoes?prioridade=URGENTE
GET /v1/tfd/solicitacoes?q=Maria        # busca em protocolo, destino, especialidade, nome do paciente
```

Resultado ordenado por `criadaEm` desc, máx 200 registros.

---

## Shape `Solicitacao` (response)

```ts
interface Solicitacao {
  id: string;
  protocolo: string;             // "TFD-2026-000137"
  pacienteId: string;
  pacienteNome: string;
  pacienteCpf: string;           // 11 dígitos sem máscara
  ubsId: string;
  ubsNome: string;
  encaminhamentoOrigemId: string | null;
  destino: string;
  unidadeDestino: string | null;
  especialidade: string;
  motivo: string;
  dataDesejada: string;          // YYYY-MM-DD
  acompanhanteNecessario: boolean;
  prioridade: 'ELETIVA' | 'PRIORITARIA' | 'URGENTE';
  status: 'PENDENTE' | 'APROVADA' | 'ALOCADA' | 'REALIZADA' | 'NEGADA' | 'CANCELADA';
  observacoes: string | null;
  motivoNegacao: string | null;
  viagemId: string | null;       // setado quando ALOCADA em uma viagem
  criadaEm: string;              // ISO 8601
  decididaEm: string | null;
  decididaPorId: string | null;
  anexos: Array<{
    id: string;
    nome: string;
    tipo: 'COMPROVANTE_ENCAMINHAMENTO' | 'EXAME' | 'LAUDO' | 'OUTRO';
    tamanhoKb: number;
    scanStatus: 'PENDENTE' | 'LIMPO' | 'INFECTADO' | 'FALHOU';
    uploadEm: string;
  }>;
}
```

---

## Auditoria

Toda criação de solicitação + anexo grava na cadeia hash TFD
(`tfd_audit_log`) com `operadorRole='ATENDENTE_TFD'`. Mesma cadeia das
ações do gestor — verificação de integridade
(`verificarCadeiaTfd`) continua íntegra.

---

## Frontend sugerido (rotas Svelte)

```
/tfd-terminal/                       Login (se diferente do gestor) ou redirect
├── /tfd-terminal/dashboard          Cards: pendentes hoje, aprovadas, total mês
├── /tfd-terminal/nova-solicitacao   Wizard 3 passos (paciente → viagem → anexos)
├── /tfd-terminal/solicitacoes       Lista com filtros (status/prioridade/q)
└── /tfd-terminal/solicitacoes/[id]  Detalhe + reanexar comprovante
```

A UI deve ser **minimalista e rápida** — recepcionista no balcão precisa
cadastrar em ≤ 90 segundos. Sugestões:

- Atalho `Ctrl+N` pra nova solicitação
- Auto-focus no campo de CPF ao abrir o wizard
- Pré-preencher UBS = a do paciente recém-buscado
- Salvar rascunho em `localStorage` se o paciente sair pra buscar um documento

---

## Tabela de erros relevantes

| HTTP | code | Resolução |
|---|---|---|
| 401 | `TOKEN_EXPIRADO` | redirecionar pra `/login` |
| 403 | `PERMISSAO_INSUFICIENTE` | role errado — checar `auth/me.role` |
| 403 | `USUARIO_SEM_PREFEITURA` | atendente sem prefeitura vinculada (corrigir cadastro) |
| 404 | `PACIENTE_NAO_ENCONTRADO` | CPF não cadastrado na prefeitura — orientar paciente a procurar UBS de origem |
| 404 | `UBS_NAO_ENCONTRADA` | UBS selecionada fora da prefeitura |
| 404 | `ANEXO_NAO_ENCONTRADO` | id inválido OU anexo de outra prefeitura |
| 409 | `ANEXO_NAO_LIBERADO` | scan pendente — `details.scanStatus`. Aguardar e re-tentar download |
| 413 | `ARQUIVO_MUITO_GRANDE` | anexo > 10 MB — comprimir antes |
| 415 | `MIME_NAO_SUPORTADO` | só PDF/JPEG/PNG |
| 422 | `PAYLOAD_INVALIDO` | Zod falhou — `details.issues` com campo a campo |
