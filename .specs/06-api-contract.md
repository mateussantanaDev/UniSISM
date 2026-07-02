# 06 · Contrato HTTP

> Esta é uma **visão executiva** do contrato. A fonte de verdade autoritativa
> é `backend/docs/API.md` (1300+ linhas) + `backend/docs/types.ts` +
> `backend/docs/api-client.ts`. Sempre consulte aqueles arquivos antes de
> implementar ou consumir.

---

## URLs

| Ambiente | Base URL |
|---|---|
| Dev local | `http://localhost:3333/v1` |
| Android emulator (apps) | `http://10.0.2.2:3333/v1` |
| Device físico (mesma Wi-Fi) | `http://<ip-local>:3333/v1` |
| Produção (por tenant) | `https://<dominio-cliente>/v1` |

**Prefixo `/v1` em todas as rotas, exceto `/metrics` (Prometheus).**

## Autenticação

| Face | Header | Esquema | TTL |
|---|---|---|---|
| Face 1 / 2 / 4 (atendente) | `Authorization: Bearer <jwt>` | JWT HS256 | access 30 min · refresh 7 dias |
| Face 3 (paciente) | `Authorization: Bearer <token-opaco>` | Base64URL opaco | access 30 min · refresh rotativo 30 dias |
| Face 4 motorista (mobile) | `Authorization: Bearer <jwt-longo>` | JWT HS256 | 30 dias |

### JWT payload (Face 1/2/4)

```json
{
  "sub": "<atendenteId>",
  "role": "ATENDENTE_UBS",
  "ubsId": "<ubs-uuid>",
  "prefeituraId": "<prefeitura-uuid>",
  "sid": "<sessaoId>",
  "iat": 1700000000,
  "exp": 1700001800
}
```

## Padrão de erro

Toda resposta de erro segue o shape:

```json
{
  "error": {
    "code": "SCREAMING_SNAKE_CASE",
    "message": "Mensagem em pt-BR para o usuário final.",
    "details": { "campo": "informação opcional contextual" }
  }
}
```

| HTTP | Significado |
|---|---|
| 400 | Payload inválido (zod) ou regra de body |
| 401 | Token ausente / expirado / inválido |
| 403 | Autenticado mas sem permissão (role ou escopo explícito no payload) |
| 404 | Recurso não existe OU está fora do escopo (anti-enumeration) |
| 409 | Conflito (status errado, CNPJ duplicado, race condition) |
| 410 | Recurso expirado (relatório com TTL > 7 dias) |
| 413 | Upload > 10 MB |
| 415 | MIME não suportado |
| 422 | Regra de negócio violada |
| 429 | Rate limit |
| 500 | Erro não tratado (sempre com `requestId` em log) |
| 503 | Manutenção |

### Códigos catalogados (amostra)

`CREDENCIAIS_INVALIDAS`, `USUARIO_INATIVO`, `USUARIO_BLOQUEADO`,
`SENHA_EXPIRADA`, `SENHA_FRACA`, `SENHA_ATUAL_INCORRETA`, `TOKEN_AUSENTE`,
`TOKEN_EXPIRADO`, `TOKEN_INVALIDO`, `REFRESH_TOKEN_INVALIDO`,
`REFRESH_TOKEN_EXPIRADO`, `REFRESH_TOKEN_REVOGADO`, `REFRESH_REUSE_DETECTED`,
`ARQUIVO_INVALIDO`, `ARQUIVO_MUITO_GRANDE`, `MIME_NAO_SUPORTADO`,
`DADOS_OBRIGATORIOS_AUSENTES`, `ENCAMINHAMENTO_NAO_ENCONTRADO`,
`ENCAMINHAMENTO_NAO_EM_PENDENCIA`, `NENHUMA_ACAO_FORNECIDA`,
`PACIENTE_NAO_ENCONTRADO`, `RELATORIO_NAO_DISPONIVEL`,
`RELATORIO_EXPIRADO`, `TFD_VIAGEM_SEM_VAGAS`, `TFD_ASSENTO_OCUPADO`,
`TFD_ASSENTO_INDISPONIVEL`, `TFD_VEICULO_REQUERIDO`, `TFD_VALOR_REQUERIDO`,
`TFD_CNH_VENCIDA`, `TFD_HODOMETRO_REGRESSO`, `FORA_DO_ESCOPO`,
`PREFEITURA_NAO_ENCONTRADA`, `UBS_NAO_ENCONTRADA`, `RATE_LIMIT`,
`ERRO_INTERNO`.

Lista completa em `backend/docs/API.md §14`.

## Endpoints — mapa rápido

> Detalhes em `backend/docs/ROTAS.md`.

### Públicos (sem auth)

```
POST /v1/auth/login
POST /v1/auth/forgot-password
POST /v1/auth/verify-code
POST /v1/auth/reset-password
POST /v1/paciente-app/auth/login
POST /v1/paciente-app/auth/ativar-conta
POST /v1/paciente-app/auth/refresh
POST /v1/paciente-app/auth/esqueci-senha
POST /v1/paciente-app/auth/redefinir-senha
POST /v1/motorista-app/auth/login
GET  /v1/health
GET  /metrics                    (sem prefixo /v1)
```

### Auth + perfil (todas as Faces atendente)

```
POST /v1/auth/logout
GET  /v1/auth/me
GET  /v1/me/profile
POST /v1/me/password
POST /v1/me/sessions/revoke-others
```

### Face 1 — UBS

```
GET  /v1/dashboard/metrics
POST /v1/encaminhamentos/extract-pdf      multipart
POST /v1/encaminhamentos                  multipart
GET  /v1/encaminhamentos                  filtros
GET  /v1/encaminhamentos/:id
PATCH /v1/encaminhamentos/:id
DELETE /v1/encaminhamentos/:id            (ADMIN/DEV)
POST /v1/encaminhamentos/:id/resolve-pendencia multipart
GET  /v1/pacientes
GET  /v1/pacientes/por-cpf/:cpf
GET  /v1/pacientes/:id
PATCH /v1/pacientes/:id
DELETE /v1/pacientes/:id
GET  /v1/relatorios
POST /v1/relatorios
GET  /v1/relatorios/:id/download
```

### Face 1 — Prontuário (sub-documentos PEC)

Padrão `POST /v1/pacientes/:pacienteId/<recurso>` + `PATCH/DELETE` por id.
Recursos: `alergias`, `condicoes-cronicas`, `medicamentos`, `atendimentos`,
`exames`, `vacinacoes`, `viagens`, `historico-familiar` (PUT array completo).

### Face 2 — Regulação SMS

```
GET  /v1/encaminhamentos/arvore           agregação UBS → Ano → Mês → Dia
POST /v1/encaminhamentos/:id/aprovar
POST /v1/encaminhamentos/:id/registrar-pendencia
POST /v1/encaminhamentos/:id/rejeitar
POST /v1/encaminhamentos/:id/resposta-sus multipart
```

### Face 4 — TFD (gestão)

```
GET  /v1/tfd/veiculos          POST    /v1/tfd/veiculos
GET  /v1/tfd/veiculos/:id      PATCH   /v1/tfd/veiculos/:id
POST /v1/tfd/veiculos/:id/manutencao
POST /v1/tfd/veiculos/:id/reativar
DELETE /v1/tfd/veiculos/:id

GET  /v1/tfd/motoristas        POST    /v1/tfd/motoristas
GET  /v1/tfd/motoristas/:id    PATCH   /v1/tfd/motoristas/:id
POST /v1/tfd/motoristas/:id/afastar
POST /v1/tfd/motoristas/:id/reativar
DELETE /v1/tfd/motoristas/:id

GET  /v1/tfd/solicitacoes      POST    /v1/tfd/solicitacoes
GET  /v1/tfd/solicitacoes/:id
POST /v1/tfd/solicitacoes/:id/aprovar      (com alocação opcional)
POST /v1/tfd/solicitacoes/:id/negar
POST /v1/tfd/solicitacoes/:id/anexos       multipart
GET  /v1/tfd/anexos/:id/download

GET  /v1/tfd/viagens           POST    /v1/tfd/viagens
GET  /v1/tfd/viagens/:id       PATCH   /v1/tfd/viagens/:id
POST /v1/tfd/viagens/:id/iniciar
POST /v1/tfd/viagens/:id/concluir
POST /v1/tfd/viagens/:id/cancelar
POST /v1/tfd/viagens/:id/passageiros
DELETE /v1/tfd/viagens/:id/passageiros/:pid
POST /v1/tfd/viagens/:id/passageiros/:pid/presenca

GET  /v1/tfd/abastecimentos    POST    /v1/tfd/abastecimentos
POST /v1/tfd/abastecimentos/:id/liberar
POST /v1/tfd/abastecimentos/:id/negar
POST /v1/tfd/abastecimentos/:id/comprovante  multipart
GET  /v1/tfd/abastecimentos/:id/comprovante

GET  /v1/tfd/saldo
POST /v1/tfd/saldo/ajustar     (ADMIN/DEV)

GET  /v1/tfd/ajudas-custo
GET  /v1/tfd/ajudas-custo/:id
POST /v1/tfd/ajudas-custo
POST /v1/tfd/ajudas-custo/:id/autorizar
POST /v1/tfd/ajudas-custo/:id/pagar        (ADMIN/DEV, multipart com comprovante)
POST /v1/tfd/ajudas-custo/:id/negar

GET  /v1/tfd/auditoria
GET  /v1/tfd/auditoria/exportar-tj         ZIP com cadeia + assinatura
GET  /v1/tfd/auditoria/verificar           valida hash chain
GET  /v1/tfd/auditoria/:id
```

### Face 4 — Motorista (mobile)

```
POST /v1/motorista-app/auth/login
GET  /v1/motorista-app/auth/me
POST /v1/motorista-app/auth/trocar-senha
POST /v1/motorista-app/auth/logout
GET  /v1/motorista-app/minhas-viagens      header X-Server-Time
GET  /v1/motorista-app/viagens/:id
POST /v1/motorista-app/viagens/:id/iniciar
POST /v1/motorista-app/viagens/:id/concluir
POST /v1/motorista-app/viagens/:id/passageiros/:pid/presenca
GET  /v1/motorista-app/ajudas-custo
POST /v1/motorista-app/me/fcm-token
DELETE /v1/motorista-app/me/fcm-token
```

### Face 3 — Paciente (mobile)

```
POST /v1/paciente-app/auth/login
POST /v1/paciente-app/auth/ativar-conta    (legado)
POST /v1/paciente-app/auth/refresh
POST /v1/paciente-app/auth/esqueci-senha
POST /v1/paciente-app/auth/redefinir-senha
POST /v1/paciente-app/auth/logout
POST /v1/paciente-app/auth/trocar-senha
GET  /v1/paciente-app/me
GET  /v1/paciente-app/meus-encaminhamentos
GET  /v1/paciente-app/notificacoes
GET  /v1/paciente-app/notificacoes/count
POST /v1/paciente-app/notificacoes/:id/lida
POST /v1/paciente-app/notificacoes/marcar-todas-lidas
GET  /v1/paciente-app/anexos/:id/download

// Banners SMS (3)
GET  /v1/paciente-app/banners

// Dossiê médico (4)
GET  /v1/paciente-app/me/dossie
GET  /v1/paciente-app/me/dossie/alergias
GET  /v1/paciente-app/me/dossie/condicoes-cronicas
GET  /v1/paciente-app/me/dossie/medicamentos

// TFD do paciente (6)
GET  /v1/paciente-app/tfd/solicitacoes
GET  /v1/paciente-app/tfd/solicitacoes/:id
GET  /v1/paciente-app/tfd/viagens
GET  /v1/paciente-app/tfd/viagens/:id
GET  /v1/paciente-app/tfd/ajudas-custo
GET  /v1/paciente-app/tfd/ajudas-custo/:id

// Push FCM
POST /v1/paciente-app/me/fcm-token
DELETE /v1/paciente-app/me/fcm-token
```

### Admin (criação de tenants / UBSs / usuários)

```
POST   /v1/admin/prefeituras    (DEV)
GET    /v1/admin/prefeituras
PATCH  /v1/admin/prefeituras/:id
DELETE /v1/admin/prefeituras/:id  (DEV)

POST   /v1/admin/ubs              (DEV/ADM)
GET    /v1/admin/ubs              (DEV/ADM/COORD/REG/GES_TFD/AT_TFD)
PATCH  /v1/admin/ubs/:id
DELETE /v1/admin/ubs/:id

POST   /v1/admin/usuarios         (DEV/ADM)
GET    /v1/admin/usuarios         (DEV/ADM/COORD)
PATCH  /v1/admin/usuarios/:id
DELETE /v1/admin/usuarios/:id
POST   /v1/admin/usuarios/:id/ativo
POST   /v1/admin/usuarios/:id/reset-senha
```

## Cabeçalhos

| Header | Quando | Significado |
|---|---|---|
| `Authorization: Bearer <token>` | Rotas privadas | JWT ou opaco |
| `Content-Type: application/json` | JSON requests | |
| `Content-Type: multipart/form-data` | Uploads | `extract-pdf`, consolidar enc, anexos TFD, resposta SUS, pagar AJC |
| `X-Request-Id` | Toda response | UUID gerado por middleware |
| `X-Server-Time` | Responses GET | ISO 8601 UTC — cursor sync incremental (motorista) |
| `Cache-Control: public, max-age=30` | `/dashboard/metrics` | TTL 30s |

## Rate limiting

| Rota | Limite |
|---|---|
| `POST /auth/login` | 10/min por IP + 5/min por login |
| `POST /auth/forgot-password` | 5/min por IP |
| `POST /auth/verify-code` | 10/min por IP + 5/min por login |
| `POST /relatorios` | 5/hora por atendente |
| Demais rotas autenticadas | 600/min por atendente |
| Endpoints públicos | 60/min por IP |

Em prod, rate limiting é por **Redis** (consistente entre réplicas) com lib
`rate-limiter-flexible`. Headers `X-RateLimit-*` informam o estado.

## Upload — tamanhos e MIMEs

| Endpoint | MIME allowlist | Max size |
|---|---|---|
| `extract-pdf`, consolidar enc | `application/pdf` | 10 MB |
| Anexos genéricos | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` | 10 MB |
| Comprovante TFD / AJC | idem | 10 MB |
| Resposta SUS | `application/pdf` | 10 MB |

> Limite enforced em multer + reforçado em prod por Caddy (`request_body { max_size 12MB }`).

## Versionamento

- Mudanças aditivas (campos novos opcionais) → mesma `v1`.
- Mudanças quebram contrato (rename, mudança de tipo) → `v2` ou flag.
- `CHANGELOG.md` lista cada release.
- Apps Flutter têm versão mínima checada via `GET /v1/health`? **Roadmap** — hoje não há check de versão mínima.
