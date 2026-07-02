# 05 · RBAC e isolamento por escopo (multi-tenant)

## Hierarquia

```
Prefeitura (tenant)                         ← criada por DESENVOLVEDOR
  ├── UBS (unidade operacional)             ← criada por DESENVOLVEDOR ou ADMIN
  │     ├── ATENDENTE_UBS                   ← criado por DESENVOLVEDOR ou ADMIN
  │     └── COORDENADOR_UBS
  ├── ADMIN (admin do tenant)               ← criado por DESENVOLVEDOR
  ├── REGULADOR_SMS                         ← criado por DESENVOLVEDOR ou ADMIN
  ├── GESTOR_TFD                            ← criado por DESENVOLVEDOR ou ADMIN
  ├── ATENDENTE_TFD (terminal rodoviário)   ← criado por DESENVOLVEDOR ou ADMIN
  └── MOTORISTA_TFD                         ← criado via /v1/tfd/motoristas
                                              (NÃO via /v1/admin/usuarios)
DESENVOLVEDOR                               ← acesso global, criado por outro DEV
```

## Roles e escopo

| Role | Escopo de leitura | Escopo do JWT |
|---|---|---|
| `DESENVOLVEDOR` | **GLOBAL** (todos os tenants) | sem `prefeituraId` nem `ubsId` |
| `ADMIN` | sua **Prefeitura** | `prefeituraId` |
| `REGULADOR_SMS` | sua **Prefeitura** | `prefeituraId` |
| `GESTOR_TFD` | sua **Prefeitura** | `prefeituraId` |
| `ATENDENTE_TFD` | sua **Prefeitura** (subset) | `prefeituraId` |
| `COORDENADOR_UBS` | sua **UBS** | `ubsId` (+ `prefeituraId` herdado) |
| `ATENDENTE_UBS` | sua **UBS** | `ubsId` (+ `prefeituraId` herdado) |
| `MOTORISTA_TFD` | suas **viagens** | `prefeituraId` + lookup `motoristaId` |

## Matriz de permissão (resumo)

| Ação | DEV | ADM | REG | GES_TFD | AT_TFD | COORD | AT_UBS | MOT |
|---|---|---|---|---|---|---|---|---|
| Criar Prefeitura | ✅ | — | — | — | — | — | — | — |
| Criar UBS | ✅ | ✅ | — | — | — | — | — | — |
| Criar usuário (qualquer role exceto MOT) | ✅ | ✅* | — | — | — | — | — | — |
| Criar Motorista TFD | ✅ | ✅ | — | ✅ | — | — | — | — |
| Consolidar encaminhamento | ✅ | — | — | — | — | ✅ | ✅ | — |
| Editar encaminhamento (após envio) | ✅ | ✅ | — | — | — | — | — | — |
| Aprovar encaminhamento | ✅ | — | ✅ | — | — | — | — | — |
| Pendência / rejeição | ✅ | — | ✅ | — | — | — | — | — |
| Resposta SUS (upload) | ✅ | — | ✅ | — | — | — | — | — |
| Resolver pendência | ✅ | — | — | — | — | ✅ | ✅ | — |
| Criar solicitação TFD | ✅ | — | — | ✅ | ✅ | ✅ | ✅ | — |
| Aprovar TFD | ✅ | — | — | ✅ | — | — | — | — |
| CRUD frota / motoristas | ✅ | ✅** | — | ✅ | — | — | — | — |
| Programar viagem | ✅ | — | — | ✅ | — | — | — | — |
| Marcar presença (mobile) | — | — | — | — | — | — | — | ✅ |
| Liberar abastecimento | ✅ | ✅ | — | ✅ | — | — | — | — |
| Ajustar saldo | ✅ | ✅ | — | — | — | — | — | — |
| Pagar ajuda de custo | ✅ | ✅ | — | — | — | — | — | — |
| Auditoria TJ (export) | ✅ | ✅ | — | — | — | — | — | — |
| Gerar relatório | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Ver auditoria do sistema | ✅ | ✅ | — | — | — | — | — | — |

\* `ADMIN` não pode criar `DESENVOLVEDOR`.
\** `ADMIN` pode deletar frota; `GESTOR_TFD` só desativa/manutenção.

## Implementação

### Middleware de auth

`src/presentation/middlewares/authMiddleware.ts`:

1. Lê `Authorization: Bearer <token>`.
2. Verifica JWT (Face 1/2/4) OU token opaco (Face 3) OU JWT longo (motorista).
3. Carrega `Atendente` do banco (com `ubs` + `prefeitura`).
4. Confere `ativo = true` e `bloqueadoAte` (se houver) já passou.
5. Popula `req.usuario` com `{ id, role, ubsId, prefeituraId, escopo }`.

### Middleware de role

`roleGuard(['ATENDENTE_UBS', 'COORDENADOR_UBS', 'DESENVOLVEDOR'])`:

```typescript
export function roleGuard(allowed: RoleAtendente[]) {
  return (req, res, next) => {
    if (!allowed.includes(req.usuario.role)) {
      return next(new ForbiddenError('FORA_DO_ESCOPO'));
    }
    next();
  };
}
```

### scopeWhere — filtro automático

`src/shared/scope.ts`:

```typescript
export function scopeWhere(
  usuario: AtendenteAutenticado,
  extra: Prisma.WhatWhereInput = {}
): Prisma.WhatWhereInput {
  switch (usuario.escopo) {
    case 'GLOBAL':
      return extra;
    case 'PREFEITURA':
      return { ...extra, prefeituraId: usuario.prefeituraId };
    case 'UBS':
      return { ...extra, ubsId: usuario.ubsId };
  }
}
```

Toda consulta de listagem aplica `scopeWhere`. GET por ID:

```typescript
const encaminhamento = await repo.findById(id);
if (!encaminhamento) throw new NotFoundError('ENCAMINHAMENTO_NAO_ENCONTRADO');

// Se existe mas não pertence ao escopo → 404 (anti-enumeration)
if (!escopoInclui(usuario, encaminhamento)) {
  throw new NotFoundError('ENCAMINHAMENTO_NAO_ENCONTRADO');
}
```

### Mutações com `prefeituraId`/`ubsId` no payload

Validar contra o escopo do usuário:

```typescript
if (payload.ubsId !== usuario.ubsId && usuario.escopo === 'UBS') {
  throw new ForbiddenError('FORA_DO_ESCOPO');
}
```

## Anti-enumeration — por que 404 e não 403

| Resposta | Vaza? |
|---|---|
| 403 FORA_DO_ESCOPO | Sim — confirma que o ID existe |
| 404 NAO_ENCONTRADO | Não — não diferencia "não existe" de "não é seu" |

O atacante que tenta `GET /encaminhamentos/<UUID-aleatório>` recebe 404 sempre,
mesmo que o UUID exista para outro tenant. Sem isso, ele poderia enumerar IDs
válidos.

**Exceção**: mutações onde o payload contém um `prefeituraId`/`ubsId`
explícito retornam **403** `FORA_DO_ESCOPO` — o atacante já sabe o ID.

## Face 3 (Paciente) — RBAC implícito

Pacientes não têm role do enum `RoleAtendente`. O middleware `pacienteAuth`:

1. Lê `Authorization: Bearer <token-opaco>`.
2. Busca `sessoes_paciente` com `tokenHash = SHA-256(token)`.
3. Verifica expiração.
4. Popula `req.paciente` com `{ id, cpf, ubsId }`.

Acesso a recursos:

- Encaminhamentos: filtro automático `WHERE pacienteId = req.paciente.pacienteId`.
- Anexos: `WHERE encaminhamento.pacienteId = req.paciente.pacienteId AND scanStatus = 'LIMPO'`.

## Boundary checking — quando o payload tem ID de outro recurso

Toda criação de recurso "filho" verifica que o "pai" pertence ao escopo do
usuário:

```typescript
// Criar encaminhamento para pacienteId X
const paciente = await pacienteRepo.findByIdScoped(payload.pacienteId, usuario);
if (!paciente) throw new NotFoundError('PACIENTE_NAO_ENCONTRADO');
// (não vaza que o paciente existe em outra UBS/tenant)
```

## Auto-criação de PacienteConta — não compromete escopo

Quando UBS consolida encaminhamento de CPF novo, a `PacienteConta` é criada
com `ubsId = ubs da consolidação`. Em consolidações posteriores por outra UBS
(mesma prefeitura) o `ubsId` da conta pode evoluir — paciente "vê" o app sob
contexto da UBS que está atendendo no momento.

## Audit por tenant

Toda linha em `relatorio_audit`, `paciente_prontuario_audit` e `tfd_audit_log`
tem `prefeituraId` obrigatório. Isso garante:

1. Auditoria por tenant em queries (`WHERE prefeituraId = ?`).
2. Hash chain do TFD é per-tenant — cada cadeia tem seu genesis.
3. Exportação para TJ é per-tenant.

## Comportamento esperado em cenários de borda

| Cenário | Resposta |
|---|---|
| Atendente desativado tenta usar token válido | 401 `USUARIO_INATIVO` (lookup no DB cada request) |
| Sessão revogada | 401 `TOKEN_INVALIDO` |
| Refresh token expirado | 401 `REFRESH_TOKEN_EXPIRADO` |
| Reuse de refresh detectado (Face 3) | 401 `REFRESH_REUSE_DETECTED` + revoga toda cadeia |
| ADMIN tenta criar DESENVOLVEDOR | 403 `FORA_DO_ESCOPO` |
| ATENDENTE_UBS tenta editar encaminhamento de outra UBS | 404 `ENCAMINHAMENTO_NAO_ENCONTRADO` |
| Paciente tenta acessar anexo de outro CPF | 404 `ANEXO_NAO_ENCONTRADO` |
| Motorista tenta iniciar viagem que não é dele | 404 `VIAGEM_NAO_ENCONTRADA` |
| Reset de senha de CPF inexistente | 200 `tokenEnviado: true` (anti-enumeration) |
| Reset de senha sem código válido | 400 `TOKEN_INVALIDO` (cooldown opcional) |
