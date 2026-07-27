# UNISISM · Guia Completo de Integração de Frontend — Centro Municipal de Especialidades (v3.0.0)

> **Documentação técnica oficial** dos contratos HTTP, fluxos de dados, estruturas JSON de requisição e resposta, cabeçalhos de autenticação e regras de negócio do módulo **Centro Municipal de Especialidades**.
> 
> Data de Atualização: 27/07/2026  
> Versão da API: `v3.0.0`

---

## 1. Visão Geral e Arquitetura de Comunicação

O **Centro Municipal de Especialidades** gerencia a atenção secundária e especializada do município. Ele é dividido em três grandes módulos/interfaces no frontend:

1. **Recepção / Regulação do Centro (Fase 1)**: Agendamento automático otimizado por algoritmo, agenda diária da recepção, check-in/presença do paciente e agendamento direto de balcão.
2. **Médico Especialista (Fase 2)**: Agenda do dia do médico, chamada de consultório, visualização do Prontuário Eletrônico (PEC), registro da consulta médica em formato SOAP e solicitação de TFD/intermunicipal.
3. **Diretoria & Gestão Executiva (Fase 3)**: Dashboard executivo em tempo real, matriz de cotas por UBS, grades de escalas dos médicos, remanejamento emergencial em lote, faturamento BPA/SIA-SUS e trilha de auditoria CFM.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FLUXO COMPLETO DO CENTRO                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
 [UBS: Encaminhamento / Rascunho]
        │
        ▼
 [SMS: AGUARDANDO_REGULACAO] ──► (Aprovação SMS) ──► [SMS: APROVADO · filaDestino = 'CENTRO_ESPECIALIDADES']
                                                             │
        ┌────────────────────────────────────────────────────┴────────────────────────────────────────────────────┐
        │                                                    │                                                    │
        ▼                                                    ▼                                                    ▼
 🟢 1. RECEPÇÃO DO CENTRO                             🩺 2. MÉDICO ESPECIALISTA                             📊 3. GESTÃO & DIRETORIA
  - GET  /v1/centro/recepcao/fila-espera               - GET  /v1/centro/medico/agenda                      - GET  /v1/centro/gestao/dashboard
  - POST /v1/centro/recepcao/agendar/:id               - POST /v1/centro/medico/chamar/:id                  - GET/PUT /v1/centro/gestao/cotas
  - GET  /v1/centro/recepcao/agenda-dia                - GET  /v1/centro/medico/pacientes/:id/prontuario    - GET/POST/PUT/DEL /v1/centro/gestao/escalas
  - POST /v1/centro/recepcao/presenca/:id              - POST /v1/centro/medico/atendimento/:id (SOAP)       - POST /v1/centro/gestao/remanejamento-lote
  - POST /v1/centro/recepcao/balcao                    - POST /v1/centro/medico/encaminhamento-intermunicipal- GET  /v1/centro/gestao/relatorios/bpa
  - POST /v1/centro/recepcao/desmarcar-reagendar/:id                                                        - GET  /v1/centro/gestao/auditoria
```

---

## 2. Autenticação, Headers e Regras de RBAC

Todas as requisições para a API do Centro devem conter o cabeçalho `Authorization` com o token JWT emitido no login.

```http
Authorization: Bearer <seu_jwt_token_aqui>
Content-Type: application/json
```

### Tabela de Permissões por Papel (RBAC):

| Módulo / Papéis Permitidos | Roles no JWT | Rotas Liberadas |
|---|---|---|
| **Recepção / Regulação** | `ATENDENTE_CENTRO`, `REGULADOR_SMS`, `COORDENADOR_UBS`, `ATENDENTE_UBS`, `ADMIN`, `DESENVOLVEDOR` | `/v1/centro/recepcao/*` |
| **Médico Especialista** | `MEDICO_ESPECIALISTA`, `COORDENADOR_UBS`, `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR` | `/v1/centro/medico/*` |
| **Diretoria / Gestão** | `REGULADOR_SMS`, `ADMIN`, `DESENVOLVEDOR`, `ATENDENTE_CENTRO` | `/v1/centro/gestao/*` |

---

## 3. Fase 1: Recepção & Regulação do Centro

### 3.1. Listar Fila de Espera do Centro
- **HTTP**: `GET /v1/centro/recepcao/fila-espera`
- **Query Params**:
  - `centro`: `CENTRO_ESPECIALIDADES` | `CENTRO_ODONTOLOGICO` (default: `CENTRO_ESPECIALIDADES`)
  - `status`: `APROVADO` | `AGUARDANDO_REGULACAO` | `TODOS` (default: `TODOS`)
  - `agendado`: `true` | `false` (opcional)
  - `especialidade`: string (opcional)
  - `prioridade`: `EMERGENCIA` | `URGENTE` | `PRIORITARIA` | `ELETIVA` (opcional)
  - `busca`: string (busca em nome do paciente, CPF ou protocolo)

**Resposta (`200 OK`)**:
```json
{
  "encaminhamentos": [
    {
      "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
      "protocolo": "ENC20260727-0001",
      "status": "APROVADO",
      "canalRoteamento": "CENTRO_ESPECIALIDADES",
      "destinoRegulacao": "CENTRO_ESPECIALIDADES",
      "agendamentoPrevisto": null,
      "statusAtendimentoCentro": null,
      "paciente": {
        "nome": "Maria das Dores Silva",
        "cpf": "12345678901",
        "cartaoSus": "898000123456789",
        "dataNascimento": "1978-05-14",
        "sexo": "F",
        "telefone": "87999887766",
        "endereco": "Rua Central, 120 - Centro"
      },
      "solicitacao": {
        "medicoSolicitante": "Dr. Carlos Eduardo",
        "crm": "CRM-PE 12345",
        "especialidadeSolicitada": "Cardiologia",
        "cid10": "I10",
        "cidDescricao": "Hipertensão essencial",
        "justificativaClinica": "Paciente com picos hipertensivos constantes.",
        "prioridade": "URGENTE",
        "dataSolicitacao": "2026-07-25"
      }
    }
  ],
  "total": 1
}
```

---

### 3.2. Agendar Consulta via Algoritmo de Otimização Backend
O atendente de recepção aciona este endpoint e o backend roda o **algoritmo de otimização de vaga**, alocando o horário ideal conforme a prioridade clínica (`EMERGENCIA`, `URGENTE`, `PRIORITARIA`, `ELETIVA`) e a escala do especialista.

- **HTTP**: `POST /v1/centro/recepcao/agendar/:id`
- **Request Body**:
```json
{
  "profissional": "Dr. Roberto Medeiros",
  "nota": "Instruir paciente a chegar 15 minutos antes com exames anteriores.",
  "localAgendamento": "Centro Municipal de Especialidades - Sala 04"
}
```

**Resposta (`200 OK`)**:
```json
{
  "encaminhamento": {
    "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
    "protocolo": "ENC20260727-0001",
    "status": "APROVADO",
    "agendamentoPrevisto": "2026-07-30T08:00:00.000Z",
    "profissionalAgendado": "Dr. Roberto Medeiros",
    "localAgendamento": "Centro Municipal de Especialidades - Sala 04",
    "statusAtendimentoCentro": "AGENDADO",
    "observacoesRegulacao": "Instruir paciente a chegar 15 minutos antes com exames anteriores."
  }
}
```

---

### 3.3. Agenda do Dia da Recepção
Exibe todos os pacientes agendados para uma data específica, com os respectivos status de recepção/presença.

- **HTTP**: `GET /v1/centro/recepcao/agenda-dia`
- **Query Params**:
  - `data`: `YYYY-MM-DD` (default: hoje)
  - `especialidade`: string (opcional)
  - `medico`: string (opcional)
  - `statusAtendimento`: `AGENDADO` | `AGUARDANDO_ATENDIMENTO` | `EM_ATENDIMENTO` | `CONCLUIDO` | `FALTOU` (opcional)

**Resposta (`200 OK`)**:
```json
{
  "agendamentos": [
    {
      "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
      "protocolo": "ENC20260727-0001",
      "agendamentoPrevisto": "2026-07-27T08:30:00.000Z",
      "profissionalAgendado": "Dr. Roberto Medeiros",
      "statusAtendimentoCentro": "AGUARDANDO_ATENDIMENTO",
      "presencaRegistradaEm": "2026-07-27T08:15:22.100Z",
      "paciente": {
        "nome": "Maria das Dores Silva",
        "cpf": "12345678901",
        "telefone": "87999887766"
      },
      "solicitacao": {
        "especialidadeSolicitada": "Cardiologia",
        "prioridade": "URGENTE"
      }
    }
  ],
  "total": 1
}
```

---

### 3.4. Confirmar Chegada / Presença / Status do Paciente
- **HTTP**: `POST /v1/centro/recepcao/presenca/:id`
- **Request Body**:
```json
{
  "status": "AGUARDANDO_ATENDIMENTO",
  "observacao": "Paciente presente na recepção, documento verificado."
}
```
*Status permitidos*: `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`, `CONCLUIDO`, `FALTOU`.

---

### 3.5. Busca de Paciente no PEC por CPF (Preenchimento Rápido no Balcão)
- **HTTP**: `GET /v1/centro/recepcao/pacientes/por-cpf/:cpf`

**Resposta (`200 OK`)**:
```json
{
  "existe": true,
  "paciente": {
    "id": "pac-9999-1111",
    "nome": "João dos Santos",
    "cartaoSus": "898000123456789",
    "dataNascimento": "1985-04-12",
    "sexo": "M",
    "telefone": "87999112233",
    "endereco": "Av. Principal, 45"
  }
}
```

---

### 3.6. Agendamento Direto de Balcão (1 Passo)
Para pacientes presenciais no balcão da recepção. Cadastra/atualiza o paciente no PEC, gera a solicitação e executa a otimização de vaga em uma única transação atômica.

- **HTTP**: `POST /v1/centro/recepcao/balcao`
- **Request Body**:
```json
{
  "paciente": {
    "nome": "Lucia Souza",
    "cpf": "98765432100",
    "cartaoSus": "898000222233334",
    "dataNascimento": "1972-09-25",
    "sexo": "F",
    "telefone": "87988887777",
    "endereco": "Rua das Flores, 45"
  },
  "solicitacao": {
    "medicoSolicitante": "Médico do Balcão",
    "crm": "CRM-PE 00000",
    "especialidadeSolicitada": "Oftalmologia",
    "cid10": "H52",
    "cidDescricao": "Erros de refração",
    "justificativaClinica": "Agendamento direto efetuado no balcão do Centro.",
    "prioridade": "ELETIVA",
    "dataSolicitacao": "2026-07-27"
  },
  "nota": "Paciente solicita atendimento no turno da manhã",
  "medicoDesejado": "Dr. Fábio Alencar"
}
```

**Resposta (`201 Created`)**:
```json
{
  "encaminhamento": {
    "id": "enc-balcao-7777",
    "protocolo": "ENC20260727-0099",
    "status": "APROVADO",
    "agendamentoPrevisto": "2026-08-10T08:00:00.000Z",
    "profissionalAgendado": "Dr. Fábio Alencar",
    "localAgendamento": "Centro Municipal de Especialidades",
    "statusAtendimentoCentro": "AGENDADO"
  }
}
```

---

### 3.7. Desmarcar ou Reagendar Consulta
- **HTTP**: `POST /v1/centro/recepcao/desmarcar-reagendar/:id`
- **Request Body**:
```json
{
  "acao": "REAGENDAR",
  "motivo": "Paciente justificou imprevisto de saúde e solicitou nova data."
}
```
*Opções de `acao`*: `DESMARCAR` (cancela a vaga) ou `REAGENDAR` (recalcula vaga no otimizador).

---

## 4. Fase 2: Médico Especialista

### 4.1. Agenda do Dia do Especialista
- **HTTP**: `GET /v1/centro/medico/agenda`
- **Query Params**:
  - `data`: `YYYY-MM-DD` (default: hoje)
  - `statusAtendimento`: `AGUARDANDO_ATENDIMENTO` | `EM_ATENDIMENTO` | `CONCLUIDO` | `FALTOU`

**Resposta (`200 OK`)**:
```json
{
  "agenda": [
    {
      "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
      "protocolo": "ENC20260727-0001",
      "agendamentoPrevisto": "2026-07-27T08:30:00.000Z",
      "statusAtendimentoCentro": "AGUARDANDO_ATENDIMENTO",
      "paciente": {
        "nome": "Maria das Dores Silva",
        "cpf": "12345678901",
        "dataNascimento": "1978-05-14",
        "sexo": "F",
        "telefone": "87999887766"
      },
      "solicitacao": {
        "especialidadeSolicitada": "Cardiologia",
        "cid10": "I10",
        "cidDescricao": "Hipertensão essencial",
        "justificativaClinica": "Picos hipertensivos recorrentes.",
        "prioridade": "URGENTE"
      }
    }
  ],
  "total": 1
}
```

---

### 4.2. Chamar Paciente para o Consultório
- **HTTP**: `POST /v1/centro/medico/chamar/:id`

**Resposta (`200 OK`)**:
```json
{
  "encaminhamento": {
    "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
    "statusAtendimentoCentro": "EM_ATENDIMENTO",
    "atendimentoIniciadoEm": "2026-07-27T08:35:10.000Z"
  }
}
```

---

### 4.3. Consultar Prontuário Eletrônico do Cidadão (PEC)
Exibe a história clínica completa do paciente para suporte durante a consulta.

- **HTTP**: `GET /v1/centro/medico/pacientes/:pacienteId/prontuario`

**Resposta (`200 OK`)**:
```json
{
  "paciente": {
    "id": "pac-9999-1111",
    "nome": "Maria das Dores Silva",
    "cpf": "12345678901",
    "cartaoSus": "898000123456789",
    "dataNascimento": "1978-05-14",
    "sexo": "F",
    "grupoSanguineo": "O_POSITIVO"
  },
  "alergias": [
    {
      "id": "alg-1",
      "substancia": "Dipirona",
      "tipo": "MEDICAMENTO",
      "gravidade": "GRAVE"
    }
  ],
  "condicoesCronicas": [
    {
      "id": "cc-1",
      "cid10": "I10",
      "descricao": "Hipertensão arterial sistêmica",
      "desde": "2020-01-15",
      "ativo": true
    }
  ],
  "medicamentosEmUso": [
    {
      "id": "med-1",
      "nome": "Losartana Potássica",
      "dosagem": "50mg",
      "frequencia": "1x ao dia",
      "desde": "2020-01-15",
      "prescritor": "Dr. Carlos Eduardo",
      "ativo": true
    }
  ],
  "atendimentosAnteriores": [
    {
      "id": "at-55",
      "data": "2026-03-10T14:00:00.000Z",
      "profissional": "Dr. Carlos Eduardo",
      "especialidade": "Clínica Geral",
      "queixaPrincipal": "Cefaleia e tontura",
      "diagnostico": "Hipertensão descompensada",
      "cid10": "I10",
      "conduta": "Ajuste de dose de Losartana para 50mg 12/12h"
    }
  ],
  "examesRealizados": [],
  "vacinasAplicadas": []
}
```

---

### 4.4. Registrar Consulta SOAP e Finalizar Atendimento
Grava a evolução médica no formato SOAP no PEC e altera o status do encaminhamento para `CONCLUIDO`.

- **HTTP**: `POST /v1/centro/medico/atendimento/:id`
- **Request Body**:
```json
{
  "subjetivo": "Paciente refere dor precordial atípica aos esforços moderados há 2 semanas.",
  "objetivo": "PA: 130x85 mmHg, FC: 74 bpm, RCR em 2T sem sopros, murmúrio vesicular audível sem ruídos adventícios.",
  "avaliacao": "Angina estável a esclarecer / Hipertensão arterial sistêmica controlada.",
  "plano": "Prescrevo Anlodipino 5mg 1x/dia. Solícito ECG de repouso e Teste Ergométrico.",
  "queixaPrincipal": "Dor no peito aos esforços",
  "diagnostico": "Angina de peito não especificada",
  "cid10": "I20.9",
  "conduta": "Orientação de hábitos de vida + Prescrição de Anlodipino 5mg + Exames complementares",
  "prescricaoResumo": "Anlodipino 5mg 1x ao dia pela manhã por 60 dias"
}
```

**Resposta (`200 OK`)**:
```json
{
  "encaminhamento": {
    "id": "c1f7a8b2-1111-42b4-82a1-987654321000",
    "statusAtendimentoCentro": "CONCLUIDO",
    "atendimentoConcluidoEm": "2026-07-27T08:55:00.000Z"
  }
}
```

---

### 4.5. Encaminhamento Intermunicipal / TFD (Alta Complexidade)
- **HTTP**: `POST /v1/centro/medico/encaminhamento-intermunicipal`
- **Request Body**:
```json
{
  "pacienteId": "pac-9999-1111",
  "solicitacao": {
    "especialidadeSolicitada": "Cirurgia Cardíaca",
    "cid10": "I25.1",
    "cidDescricao": "Doença aterosclerótica do coração",
    "justificativaClinica": "Necessidade de Cateterismo Cardíaco e eventual revascularização em serviço de referência terciário.",
    "prioridade": "URGENTE"
  }
}
```

---

## 5. Fase 3: Diretoria & Gestão Executiva

### 5.1. Dashboard Executivo da Diretoria
- **HTTP**: `GET /v1/centro/gestao/dashboard`

**Resposta (`200 OK`)**:
```json
{
  "hoje": {
    "totalAgendados": 45,
    "aguardandoAtendimento": 12,
    "emAtendimento": 3,
    "concluidos": 28,
    "faltas": 2
  },
  "mesAtual": {
    "periodo": "2026-07",
    "totalAgendados": 820,
    "totalConcluidos": 750,
    "totalFaltas": 70,
    "taxaAbsenteismoPorcento": 8.5
  },
  "distribuicaoPorEspecialidade": {
    "Cardiologia": 240,
    "Oftalmologia": 310,
    "Dermatologia": 150,
    "Ortopedia": 120
  },
  "distribuicaoPorUbs": {
    "UBS Centro": 300,
    "UBS Vila Nova": 250,
    "UBS Zona Rural": 270
  },
  "totalEscalasAtivas": 8
}
```

---

### 5.2. Gestão da Matriz de Cotas por UBS
- **HTTP**: `GET /v1/centro/gestao/cotas`
- **HTTP**: `PUT /v1/centro/gestao/cotas/:ubsId`
- **Request Body**:
```json
{
  "totalCotasMes": 350,
  "especialidades": {
    "Cardiologia": 80,
    "Oftalmologia": 100,
    "Dermatologia": 50,
    "Ortopedia": 70,
    "Neurologia": 50
  }
}
```

---

### 5.3. Cadastro e Edição de Escalas de Médicos
- **HTTP**: `GET /v1/centro/gestao/escalas`
- **HTTP**: `POST /v1/centro/gestao/escalas`
- **HTTP**: `PUT /v1/centro/gestao/escalas/:id`
- **HTTP**: `DELETE /v1/centro/gestao/escalas/:id`
- **Request Body (POST/PUT)**:
```json
{
  "medicoNome": "Dr. Roberto Medeiros",
  "crm": "CRM-PE 12345",
  "especialidade": "Cardiologia",
  "diasSemana": ["SEG", "QUA", "SEX"],
  "horarioInicio": "08:00",
  "horarioFim": "12:00",
  "duracaoMinutos": 20,
  "vagasPorTurno": 12
}
```

---

### 5.4. Remanejamento Emergencial em Lote
- **HTTP**: `POST /v1/centro/gestao/remanejamento-lote`
- **Request Body**:
```json
{
  "medicoOrigem": "Dr. Roberto Medeiros",
  "dataOrigem": "2026-07-27",
  "medicoDestino": "Dra. Sandra Regina",
  "dataDestino": "2026-07-28",
  "notificarSms": true
}
```

**Resposta (`200 OK`)**:
```json
{
  "totalRemanejados": 12,
  "dataDestino": "2026-07-28",
  "medicoDestino": "Dra. Sandra Regina"
}
```

---

### 5.5. Relatório Faturável BPA / SIA-SUS
- **HTTP**: `GET /v1/centro/gestao/relatorios/bpa?periodo=2026-07`

**Resposta (`200 OK`)**:
```json
{
  "periodo": "2026-07",
  "totalAtendimentos": 750,
  "porEspecialidade": {
    "Cardiologia": 240,
    "Oftalmologia": 310
  },
  "itens": [
    {
      "protocolo": "ENC20260727-0001",
      "pacienteNome": "Maria das Dores Silva",
      "pacienteCpf": "12345678901",
      "pacienteCartaoSus": "898000123456789",
      "especialidade": "Cardiologia",
      "cid10": "I10",
      "profissional": "Dr. Roberto Medeiros",
      "dataAgendada": "2026-07-27"
    }
  ]
}
```

---

### 5.6. Trilha de Auditoria Imutável (CFM Compliance)
- **HTTP**: `GET /v1/centro/gestao/auditoria?limit=50&offset=0`

**Resposta (`200 OK`)**:
```json
{
  "total": 150,
  "logs": [
    {
      "id": "aud-100",
      "acao": "CENTRO_MEDICO_REGISTRAR_SOAP",
      "recurso": "CENTRO_ESPECIALIDADES",
      "recursoId": "c1f7a8b2-1111-42b4-82a1-987654321000",
      "atendenteId": "usr-medico-1",
      "atendenteNome": "Dr. Roberto Medeiros",
      "criadoEm": "2026-07-27T08:55:00.000Z"
    }
  ]
}
```

---

## 6. Resumo de Enums e Códigos de Erro

### Enums do Sistema:
- `StatusEncaminhamento`: `RASCUNHO`, `AGUARDANDO_REGULACAO`, `PENDENCIA_DOCUMENTO`, `APROVADO`, `REJEITADO`
- `StatusAtendimentoCentro`: `AGENDADO`, `AGUARDANDO_ATENDIMENTO`, `EM_ATENDIMENTO`, `CONCLUIDO`, `FALTOU`
- `PrioridadeClinica`: `EMERGENCIA`, `URGENTE`, `PRIORITARIA`, `ELETIVA`
- `CanalRoteamento`: `SUS`, `CENTRO_ESPECIALIDADES`, `CENTRO_ODONTOLOGICO`

### Erros Padrão da API:
- `401 Unauthorized`: Token JWT ausente ou expirado.
- `403 Forbidden`: Usuário sem a role necessária para a rota.
- `404 Not Found`: Encaminhamento, paciente ou escala não encontrada.
- `422 Unprocessable Entity`: Paciente sem vínculo no PEC ou payload inconsistente.

---
*UNISISM · Coordenação de Tecnologia e Integração em Saúde Municipal · 2026*
