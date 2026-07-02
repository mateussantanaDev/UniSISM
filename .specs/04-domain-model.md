# 04 · Modelo de domínio

> Snapshot do schema Prisma (`backend/prisma/schema.prisma`). ~50 tabelas. Aqui
> está a visão lógica agrupada por agregado — para o SQL preciso, leia o
> schema. Para os contratos HTTP de cada agregado, leia `backend/docs/API.md`.

---

## 1. Identidade e auth

### Prefeitura (tenant)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `nome` | string | Nome institucional |
| `municipio` | string | Cidade-sede |
| `uf` | string(2) | Sigla do estado |
| `cnpj` | string? unique | |
| `ativa` | bool | Soft toggle |
| `deletadoEm` | datetime? | Soft delete |
| `criadoEm` / `atualizadoEm` | datetime | |

> **Em uma instalação multi-tenant** o banco pode conter N `Prefeitura`. O
> isolamento se dá por `scopeWhere` que injeta `prefeituraId` em toda query.

### Ubs

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `nome` | string | |
| `municipio` / `uf` | string | |
| `endereco` / `bairro` / `cep` | string? | |
| `cnes` | string? unique | Cadastro Nacional de Estab. de Saúde |
| `telefone` / `whatsapp` / `email` | string? | Mostrados no app paciente |
| `latitude` / `longitude` | decimal? | Mapa no app |
| `horarios` | json? | `{ segunda: {abre, fecha}, ... }` |
| `observacoes` | text? | |
| `ativa` | bool | |
| `deletadoEm` | datetime? | |
| `prefeituraId` | uuid → Prefeitura | |

### Atendente

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `matricula` | string unique | Login alternativo |
| `nome` | string | UPPERCASE convencionalmente |
| `email` | string unique | Login alternativo |
| `senhaHash` | string | bcrypt |
| `cpf` | string unique | |
| `telefone` | string? | |
| `dataNascimento` | datetime? | |
| `cargo` | string | Default `ATENDENTE DE REGULAÇÃO` |
| `funcao` | string | |
| `role` | `RoleAtendente` enum | |
| `ativo` | bool | |
| `bloqueadoAte` | datetime? | Após 5 falhas em 15min |
| `twoFAAtivo` / `metodoTwoFA` | bool/string? | Roadmap |
| `senhaAlteradaEm` | datetime | |
| `deletadoEm` | datetime? | |
| `ubsId` | uuid? → Ubs | Vazio para DEV/ADM/REG |
| `prefeituraId` | uuid? → Prefeitura | Vazio para DEV |
| `criadoPorId` | uuid? → Atendente | Trilha |

### Sessao, RefreshToken, PasswordResetCode, TentativaLogin

Suportes do fluxo de auth — leia o schema para campos exatos.

### AuditoriaLog (operacional, não-imutável)

Log operacional de ações. **Diferente do `relatorio_audit` / `paciente_prontuario_audit` / `tfd_audit_log`** que são imutáveis por trigger.

---

## 2. Paciente (PEC)

### Paciente

Agregado raiz do PEC.

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `nome` / `nomeSocial` | string / string? |
| `cpf` | string unique |
| `cartaoSus` | string? unique |
| `dataNascimento` | datetime |
| `sexo` | `Sexo` enum |
| `telefone` / `telefoneSecundario` / `email` | string? |
| `nomeMae` / `nomePai` | string? |
| `estadoCivil` | `EstadoCivil` |
| `escolaridade` / `profissao` | string? |
| `racaCor` | `RacaCor` |
| `endereco` / `bairro` / `municipio` / `uf` / `cep` | string? |
| `grupoSanguineo` | `GrupoSanguineo` |
| `historicoFamiliar` | string[] |
| `agenteComunitario` / `microarea` / `equipeSaudeFamilia` | string? |
| `ubsId` | uuid → Ubs |
| `cadastradoEm` / `atualizadoEm` / `deletadoEm` | datetime[?] |

### Sub-documentos (parte do PEC — audit CFM 20 anos)

| Modelo | Conteúdo |
|---|---|
| `Alergia` | `substancia`, `tipo` (medicamento/alimento/ambiental/outro), `gravidade` |
| `CondicaoCronica` | `cid10`, `descricao`, `desde`, `ativo` |
| `MedicamentoEmUso` | `nome`, `dosagem`, `frequencia`, `desde`, `prescritor` |
| `Atendimento` | `tipo`, `profissional`, `registroProfissional`, `cid10`, `conduta`, etc. (SOAP) |
| `ExameRealizado` | `tipo`, `categoria`, `solicitante`, `unidadeExecutora`, `resultado` |
| `VacinaAplicada` | dose, lote, via, fabricante |
| `ViagemTFD` | histórico de viagens no prontuário (separado do módulo TFD operacional) |
| `MedicoAtendente` | médicos que acompanham |

**Toda mutação dessas tabelas gera linha em `paciente_prontuario_audit` (retenção 20 anos, append-only).**

### PacienteConta (Face 3 — app)

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `cpf` | string unique |
| `cpfFormatado` | string |
| `nome` | string |
| `senhaHash` | string (bcrypt) |
| `senhaProvisoria` | bool — `true` quando recém-criada (senha = CPF) |
| `ativo` | bool |
| `ubsId` | uuid? → Ubs |
| (relations: `sessoesPaciente`, `refreshTokensPaciente`, `notificacoes`) | |

> Conta auto-criada na primeira consolidação de encaminhamento de um CPF
> novo. Não há fluxo de "cadastro" pelo app.

---

## 3. Encaminhamento (Face 1 + 2)

### Encaminhamento

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `protocolo` | string unique | `UBS-AAAA-NNNNNN` |
| `pacienteId` | uuid → Paciente | |
| `ubsId` | uuid → Ubs | |
| `atendenteId` | uuid → Atendente | quem consolidou |
| `especialidade` | string | |
| `prioridade` | `PrioridadeClinica` | ELETIVA / PRIORITARIA / URGENTE / EMERGENCIA |
| `status` | `StatusEncaminhamento` | RASCUNHO / AGUARDANDO_REGULACAO / PENDENCIA_DOCUMENTO / APROVADO / REJEITADO |
| `cid10` / `queixa` / `conduta` | string | |
| `anexos` | `Anexo[]` | múltiplos |
| `timeline` | `EventoTimeline[]` | trilha humana |
| `respostaSusUrl` | string? | PDF oficial do SUS Federal |
| `agendamentoPrevisto` | datetime? | Setado pela Regulação ao aprovar |
| `motivoRejeicao` / `observacoesPendencia` | string? | |
| `criadoEm` / `atualizadoEm` / `deletadoEm` | datetime[?] | |

### Anexo

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `tipo` | `TipoAnexo` (SOLICITACAO / RG / CPF / CARTAO_SUS / EXAME / LAUDO / RESPOSTA_SUS / OUTRO) |
| `mimeType` / `tamanhoBytes` | string / int |
| `storageKey` | string |
| `scanStatus` | PENDENTE / LIMPO / INFECTADO / FALHOU |
| `compressaoStatus` | PENDENTE / OK / FALHOU |
| `encaminhamentoId` | uuid → Encaminhamento |

### EventoTimeline

| Campo | Tipo |
|---|---|
| `tipo` | `TipoEventoTimeline` (CRIADO, DOCUMENTO_ANEXADO, ENVIADO_REGULACAO, PENDENCIA_REGISTRADA, APROVADO, REJEITADO, AGENDADO, OBSERVACAO, RESPOSTA_SUS_RECEBIDA, EDITADO) |
| `descricao` | string |
| `atendenteId` | uuid? |
| `criadoEm` | datetime |

### NotificacaoPaciente

| Campo | Tipo |
|---|---|
| `tipo` | `TipoNotificacaoPaciente` |
| `pacienteContaId` | uuid → PacienteConta |
| `encaminhamentoId` | uuid? → Encaminhamento |
| `titulo` / `corpo` | string |
| `lidaEm` | datetime? |
| `criadoEm` | datetime |

---

## 4. Relatórios (LGPD-first)

### Relatorio

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `tipo` | `TipoRelatorio` (PRODUCAO_INDIVIDUAL / ENCAMINHAMENTOS_POR_ESPECIALIDADE / FILA_REGULACAO / PENDENCIAS_RESOLVIDAS / TFD_CUSTOS / VACINACAO_UBS / BUSCA_ATIVA) |
| `dataInicial` / `dataFinal` | datetime |
| `formato` | `FormatoRelatorio` (PDF / CSV / XLSX) |
| `filtros` | json |
| `status` | `StatusRelatorio` (DISPONIVEL / PROCESSANDO / FALHA) |
| `storageKey` | string? |
| `linkExpiraEm` | datetime? — TTL 7 dias |
| `atendenteId` | uuid → Atendente |
| `prefeituraId` / `ubsId` | uuid? |

### relatorio_audit (imutável — LGPD 5 anos)

Toda solicitação de relatório gera linha; **não pode ser editada nem deletada**.

---

## 5. TFD (Face 4)

### VeiculoTFD

`placa` (unique), `modelo`, `capacidade`, `kmAtualHodometro`, `status` (ATIVO / MANUTENCAO / INATIVO), `prefeituraId`.

### MotoristaTFD

| Campo | Observação |
|---|---|
| `id` | uuid |
| `atendenteId` | 1:1 com `Atendente` role `MOTORISTA_TFD` |
| `cnh` / `categoriaCnh` / `cnhVigencia` | datas |
| `status` | ATIVO / AFASTADO / INATIVO |
| `prefeituraId` | uuid |

### SolicitacaoTFD

| Campo | Observação |
|---|---|
| `protocolo` | `TFD-AAAA-NNNNNN` |
| `pacienteId` | uuid → Paciente |
| `origem` / `destino` / `unidadeDestino` | strings |
| `motivo` / `especialidade` | strings |
| `prioridade` | enum |
| `status` | PENDENTE / APROVADA / NEGADA / EXECUTADA / CANCELADA |
| `comprovantes` | `AnexoTFD[]` |
| `ubsId` | uuid? |
| `criadoPorId` | uuid → Atendente |

### ViagemFrota

| Campo | Observação |
|---|---|
| `id` | uuid |
| `dataSaida` | datetime |
| `dataChegadaPrevista` | datetime |
| `veiculoId` | uuid → VeiculoTFD |
| `motoristaId` | uuid → MotoristaTFD |
| `vagasTotais` | int (default = capacidade do veículo) |
| `kmInicialHodometro` / `kmFinalHodometro` | int? |
| `status` | AGENDADA / EM_ANDAMENTO / CONCLUIDA / CANCELADA |
| `passageiros` | `ViagemPassageiro[]` |
| `prefeituraId` | uuid |

### ViagemPassageiro

| Campo | Observação |
|---|---|
| `viagemId` / `pacienteId` / `solicitacaoTfdId` | uuids |
| `numeroAssento` | string (unique por viagem) |
| `presenca` | PRESENTE / AUSENTE / DESISTIU |
| `observacao` | string? |

### Abastecimento

`AnexoTFD` para comprovante. Status: SOLICITADO / LIBERADO / COMPROVADO / NEGADO. `valorEstimado` ou `litros × precoLitro`.

### SaldoVeiculo, SaldoAjudaCusto

Orçamento mensal. Ajuste auditado.

### AjudaCusto

| Campo | Observação |
|---|---|
| `protocolo` | `AJC-AAAA-NNNNNN` |
| `pacienteId` | |
| `categoria` | ALIMENTACAO / HOSPEDAGEM / DESLOCAMENTO_LOCAL |
| `valorBRL` | float |
| `status` | PENDENTE / AUTORIZADA / PAGA / NEGADA |
| `formaPagamento` | PIX / TRANSFERENCIA |
| `comprovantePagamento` | `AnexoTFD?` |

### tfd_audit_log (imutável — hash chain SHA-256)

| Campo | Observação |
|---|---|
| `id` | uuid |
| `prefeituraId` | uuid |
| `evento` | string (SCREAMING_SNAKE) |
| `payload` | jsonb |
| `hashAnterior` | string(64) |
| `hash` | string(64) — `SHA-256(payload_canonical || hashAnterior)` |
| `assinaturaIcpBrasil` | text? — quando `TFD_SIGN_REQUIRED=true` |
| `atendenteId` | uuid? |
| `ip` / `userAgent` | string? |
| `criadoEm` | datetime |

---

## 6. Banners SMS (Face 3)

`SmsBanner` — cards informativos do app paciente, gerenciados pela SMS. Campos: `titulo`, `corpo`, `imagemUrl`, `ativo`, `ordem`, `prefeituraId`.

---

## 7. Enums principais

| Enum | Valores |
|---|---|
| `RoleAtendente` | DESENVOLVEDOR, ADMIN, COORDENADOR_UBS, ATENDENTE_UBS, REGULADOR_SMS, GESTOR_TFD, ATENDENTE_TFD, MOTORISTA_TFD |
| `Sexo` | M, F, OUTRO |
| `StatusEncaminhamento` | RASCUNHO, AGUARDANDO_REGULACAO, PENDENCIA_DOCUMENTO, APROVADO, REJEITADO |
| `PrioridadeClinica` | ELETIVA, PRIORITARIA, URGENTE, EMERGENCIA |
| `TipoAnexo` | SOLICITACAO, RG, CPF, CARTAO_SUS, EXAME, LAUDO, RESPOSTA_SUS, OUTRO |
| `TipoEventoTimeline` | CRIADO, DOCUMENTO_ANEXADO, ENVIADO_REGULACAO, PENDENCIA_REGISTRADA, APROVADO, REJEITADO, AGENDADO, OBSERVACAO, RESPOSTA_SUS_RECEBIDA, EDITADO |
| `TipoNotificacaoPaciente` | ENCAMINHAMENTO_CRIADO, PENDENCIA_REGISTRADA, PENDENCIA_RESOLVIDA, APROVADO, AGENDADO, REJEITADO, RESPOSTA_SUS_DISPONIVEL |
| `GrupoSanguineo` | A_POSITIVO, A_NEGATIVO, B_POSITIVO, B_NEGATIVO, AB_POSITIVO, AB_NEGATIVO, O_POSITIVO, O_NEGATIVO, NAO_INFORMADO |
| `EstadoCivil` | SOLTEIRO, CASADO, DIVORCIADO, VIUVO, UNIAO_ESTAVEL, OUTRO |
| `RacaCor` | BRANCA, PRETA, PARDA, AMARELA, INDIGENA, NAO_INFORMADA |
| `TipoAlergia` | MEDICAMENTO, ALIMENTO, AMBIENTAL, OUTRO |
| `GravidadeAlergia` | LEVE, MODERADA, GRAVE |
| `TipoAtendimento` | CONSULTA_MEDICA, ENFERMAGEM, VACINACAO, CURATIVO, ODONTOLOGICO, PROCEDIMENTO, ACOLHIMENTO |
| `StatusViagemTFD` | AGENDADA, REALIZADA, CANCELADA, EM_ANDAMENTO |
| `TransporteTFD` | VAN_SMS, AMBULANCIA, PASSAGEM_RODOVIARIA, PASSAGEM_AEREA |
| `CategoriaExame` | LABORATORIAL, IMAGEM, FUNCIONAL, OUTROS |
| `ResultadoExame` | NORMAL, ALTERADO, CRITICO, PENDENTE |
| `TipoRelatorio` | PRODUCAO_INDIVIDUAL, ENCAMINHAMENTOS_POR_ESPECIALIDADE, FILA_REGULACAO, PENDENCIAS_RESOLVIDAS, TFD_CUSTOS, VACINACAO_UBS, BUSCA_ATIVA |
| `FormatoRelatorio` | PDF, CSV, XLSX |
| `StatusRelatorio` | DISPONIVEL, PROCESSANDO, FALHA |

---

## 8. Invariantes do domínio

1. **Um Atendente pertence a UMA prefeitura** (exceto DESENVOLVEDOR) e **opcionalmente** a uma UBS.
2. **Um Paciente pertence a UMA UBS** (que pertence a UMA prefeitura).
3. **Um Encaminhamento pertence a UMA UBS e UM Paciente**, ambos do mesmo tenant.
4. **Uma ViagemFrota pertence a UM Veículo, UM Motorista e UMA prefeitura**.
5. **Soft delete preserva audit** — `deletadoEm` em entidade pai não apaga linhas em tabelas `_audit`.
6. **Audit imutável é per-tenant** — `prefeituraId` em toda linha de audit.
7. **Cadeia hash é per-tenant** — cada prefeitura tem sua própria cadeia (genesis por tenant), evitando contaminação cruzada.
8. **Protocolo é único per-tenant per-ano** — `SequencialProtocolo` mantém counter por `(tenantId, ano, tipo)`.

---

Para os contratos HTTP de cada agregado, veja `backend/docs/API.md` e os
specs específicos por Face em [`07-face1-ubs.md`](./07-face1-ubs.md),
[`08-face2-regulacao.md`](./08-face2-regulacao.md),
[`09-face3-paciente-app.md`](./09-face3-paciente-app.md),
[`10-face4-tfd.md`](./10-face4-tfd.md).
