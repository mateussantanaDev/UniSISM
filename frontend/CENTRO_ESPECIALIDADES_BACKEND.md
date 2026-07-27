# UNISISM · Guia Completo do Backend — Centro Municipal de Especialidades (v3.0.0)

> Documentação técnica oficial dos contratos, fluxos de dados, modelos de banco, regras de negócio e endpoints requeridos pelo frontend do **Centro Municipal de Especialidades** (Faces da Recepção, do Médico Especialista e da Diretoria/Gestão).
>
> Data de Atualização: 27/07/2026  
> Versão do Módulo: v3.0.0 (Fase 1: Recepção + Fase 2: Médico + Fase 3: Gestão & Diretoria)

---

## 1. Visão Geral do Módulo

O **Centro Municipal de Especialidades** gerencia a atenção secundária e especializada do município após a regulação da Secretaria Municipal de Saúde (SMS).

### 🔄 Fluxo Completo de Documentos e Domínio Direto:

```
[UBS: Encaminhamento / Rascunho]
       ↓ (Ingestão / OCR)
[SMS: AGUARDANDO_REGULACAO]
       ↓ (Aprovação da Regulação SMS)
[SMS: APROVADO · filaDestino = 'CENTRO_ESPECIALIDADES']
       ↓
       ├─► [ATENDENTE CENTRO: Algoritmo Backend Otimiza Vaga → agendamentoPrevisto setado]
       │
       ├─► [MÉDICO CENTRO: Agenda do Dia]
       │       ↓
       │       ├─► [Iniciar Atendimento → status = 'EM_ATENDIMENTO']
       │       ├─► [Registrar SOAP no PEC → POST /pacientes/:id/atendimentos]
       │       ├─► [Concluir Consulta → status = 'CONCLUIDO']
       │       └─► [Encaminhamento Intermunicipal → SMS: AGUARDANDO_REGULACAO]
       │
       └─► [DIRETORIA / GESTÃO DO CENTRO: Domínio Absoluto Operacional]
               ↓
               ├─► [Matriz de Cotas por UBS → GET/POST /gestao/cotas]
               ├─► [Grades e Escalas dos Médicos → GET/POST /gestao/escalas]
               ├─► [Registro de Férias e Licenças → POST /gestao/escalas/:id/ferias]
               ├─► [Remanejamento Emergencial em Lote → POST /gestao/remanejamento-lote]
               ├─► [Analytics & Prestação de Contas BPA/SIA-SUS → GET /gestao/producao]
               └─► [Trilha de Auditoria & Compliance → GET /gestao/auditoria]
```

---

## 2. Visão de Papéis e Permissões (RBAC)

| Papel | Rota / Módulo | Funcionalidades Principais |
|---|---|---|
| `REGULADOR_SMS` / `ATENDENTE_UBS` | `/centro/recepcao/*` | Agendar vagas via algoritmo, gerenciar agenda do dia da recepção, cadastro e agendamento direto de balcão. |
| `COORDENADOR_UBS` / `MEDICO` | `/centro/medico/agenda` | Visualizar agenda diária por especialidade/data, consultar solicitação original, ver Prontuário (PEC), realizar atendimento SOAP e gerar encaminhamentos intermunicipais. |
| `REGULADOR_SMS` / `COORDENADOR_UBS` / `ADMIN` / `DESENVOLVEDOR` | `/centro/gestao/*` | **Domínio Absoluto da Diretoria**: distribuição de cotas por UBS, cadastro de escalas de especialistas, bloqueio de férias, remanejamento emergencial em lote, analytics de produção faturável BPA/SUS e logs de auditoria imutáveis. |

---

## 3. Fase 3: Módulo de Gestão & Diretoria Executiva

### 3.1. Controle de Cotas por UBS
O Diretor pode estipular limites de vagas por especialidade para cada Unidade Básica de Saúde. O backend deve validar essas cotas no momento do agendamento automático.

- **HTTP**: `GET /v1/centro/gestao/cotas`
- **HTTP**: `PUT /v1/centro/gestao/cotas/:ubsId`
- **Payload**:

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

### 3.2. Escalas de Trabalho e Grade de Atendimento dos Médicos
O backend armazena os dias, turnos e tempo de consulta por especialista:

- **HTTP**: `GET /v1/centro/gestao/escalas`
- **HTTP**: `POST /v1/centro/gestao/escalas`
- **Payload**:

```json
{
  "medicoNome": "Dr. Roberto Medeiros",
  "crm": "CRM 12345",
  "especialidade": "Cardiologia",
  "diasSemana": ["SEG", "QUA", "SEX"],
  "horarioInicio": "08:00",
  "horarioFim": "12:00",
  "duracaoMinutos": 20,
  "vagasPorTurno": 12
}
```

### 3.3. Registro de Férias e Remanejamento Emergencial em Lote
Quando um médico entra em férias ou sofre imprevisto, o diretor pode acionar o remanejamento em lote:

- **HTTP**: `POST /v1/centro/gestao/remanejamento-lote`
- **Payload**:

```json
{
  "medicoOrigem": "Dr. Roberto Medeiros",
  "dataOrigem": "2026-07-27",
  "medicoDestino": "Dra. Sandra Regina",
  "dataDestino": "2026-07-28",
  "notificarSms": true
}
```

### 3.4. Relatórios Oficiais e Faturamento BPA / SIA-SUS
- **HTTP**: `GET /v1/centro/gestao/relatorios/bpa?periodo=2026-07`
- **Uso**: Gera os arquivos de faturamento de produção ambulatória para o SUS e órgãos de controle em PDF, CSV ou XLSX.

### 3.5. Trilha de Auditoria (Audit Trail Compliance)
- **HTTP**: `GET /v1/centro/gestao/auditoria`
- **Uso**: Registro imutável de todas as ações no Centro (agendamentos, alterações de cotas, desmarcamentos, atendimentos e TFDs).

---

## 4. Garantias de Qualidade

- **Compilação**: 0 erros e 0 avisos no `svelte-check`.
- **RBAC**: Proteção em profundidade com sincronia frontend-backend.
- **Auditoria CFM**: Conforme Resolução CFM 1.821/2007 para guarda e auditoria de registros eletrônicos de saúde.

*UNISISM · Coordenação de Tecnologia e Sistemas de Saúde Municipal · 2026*
