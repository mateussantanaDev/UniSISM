# UNISISM - Guia de Especificação de Backend: Especialidades do Centro & Regulação

Este documento fornece a especificação técnica detalhada para implementação e sincronização do backend das rotas de **Centro de Especialidades Médicas (CEM/CEO/Centro)**, **Procedimentos SIGTAP Múltiplos**, **Balcão Retroativo**, **Disparo de Notificações por Ausência Médica**, **Remarcação na Fila de Regulação** e **Realocação Manual TFD**.

---

## 1. Resumo das Regras de Negócio e Funcionalidades

| Funcionalidade                                                | Descrição da Regra                                                                                                                              | Requisito do Backend                                                                                                                                                  |
| :------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Separação Consulta vs Procedimento por Médico**          | O mesmo médico especialista pode possuir grades distintas para Atendimentos de Consulta e Atendimentos de Procedimento Diagnóstico/Terapêutico. | Tabela `escala_especialistas` com campo `tipoServico: 'CONSULTA' \| 'PROCEDIMENTO'` e vínculo opcional com catálogo SIGTAP.                                           |
| **2. Múltiplos Procedimentos por Atendimento**                | No momento da consulta/atendimento, o médico pode registrar 1 ou mais procedimentos realizados no paciente para faturamento SIGTAP.             | Tabela `atendimento_procedimentos_realizados` com relacionamento N:1 para o atendimento/agendamento.                                                                  |
| **3. Cadastro de Balcão Retroativo**                          | Permite digitação de fichas de papel e atendimentos passados no balcão com datas/horários manuais.                                              | Endpoint de criação de agendamento aceita `modoData: 'RETROATIVO'`, `dataRetroativa`, `horaRetroativa` e `statusRetroativo: 'CONCLUIDO' \| 'AGUARDANDO' \| 'FALTOU'`. |
| **4. Disparo de Notificações por Ausência / Mudança de Data** | Notificação em massa aos pacientes agendados em caso de falta médica, licença ou alteração de turno/data.                                       | Endpoint `POST /v1/centro/notificacoes/ausencia-medica` que dispara mensagens push no App do Paciente, SMS e WhatsApp.                                                |
| **5. Remarcação de Atendimento na Regulação**                 | Permite alterar a data/horário de um encaminhamento sem perder a ordem de chegada ou a prioridade na fila.                                      | Endpoint `POST /v1/encaminhamentos/:id/remarcar` que atualiza a data prevista e insere um evento histórico de remarcação na timeline.                                 |
| **6. Realocação / Reagendamento Manual de Voltas TFD**        | Escolha manual de datas/horários para paciente ou viagens de volta TFD sem força de tabela automática.                                          | Endpoint de alocação/aprovação aceita parâmetro `modoAlocacao: 'MANUAL'` com `dataManual` customizada.                                                                |

---

## 2. Modelos do Banco de Dados (Prisma Schemas)

### 2.1 Modelo `EscalaEspecialista` (Grade Médica)

```prisma
model EscalaEspecialista {
  id              String             @id @default(uuid())
  medicoId        String
  medicoNome      String
  crm             String
  especialidade   String
  tipoServico     TipoServicoCentro  @default(CONSULTA) // CONSULTA, PROCEDIMENTO
  procedimentoId  String?            // ID opcional do catálogo SIGTAP se tipoServico == PROCEDIMENTO
  diasSemana      String[]           // ["SEG", "TER", "QUA", "QUI", "SEX"]
  horarioInicio   String             // "08:00"
  horarioFim      String             // "12:00"
  duracaoMinutos  Int                @default(20)
  vagasPorTurno   Int                @default(12)
  status          StatusAgendaMedica @default(ATIVA) // ATIVA, FERIAS, LICENCA, BLOQUEADA

  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  @@map("escala_especialistas")
}

enum TipoServicoCentro {
  CONSULTA
  PROCEDIMENTO
}

enum StatusAgendaMedica {
  ATIVA
  FERIAS
  LICENCA
  BLOQUEADA
}
```

### 2.2 Modelo `AtendimentoProcedimentoRealizado` (Múltiplos Procedimentos)

```prisma
model AtendimentoProcedimentoRealizado {
  id              String      @id @default(uuid())
  atendimentoId   String
  atendimento     Atendimento @relation(fields: [atendimentoId], references: [id], onDelete: Cascade)

  codigoSigtap    String?     // Ex: "02.11.02.003-6"
  nome            String      // Ex: "Eletrocardiograma (ECG)"
  quantidade      Int         @default(1)
  valorUnitario   Float       @default(0.0)
  observacao      String?

  registradoPorId String?     // ID do Médico ou Atendente
  registradoEm    DateTime    @default(now())

  @@map("atendimento_procedimentos_realizados")
}
```

### 2.3 Atualizações na Tabela `AgendamentoCentro` (Balcão Retroativo & Status)

```prisma
model AgendamentoCentro {
  id                   String                  @id @default(uuid())
  protocolo            String                  @unique // Ex: BALCAO-2026-XXXX
  pacienteId           String
  paciente             Paciente                @relation(fields: [pacienteId], references: [id])
  medicoId             String?
  especialidade        String
  tipoServico          TipoServicoCentro       @default(CONSULTA)
  procedimentoNome     String?

  // Datas & Modo Retroativo
  modoData             ModoDataAgendamento     @default(AUTODATA) // AUTODATA, MANUAL, RETROATIVO
  dataAgendamento      DateTime
  horaAgendamento      String
  status               StatusAgendamentoCentro @default(AGUARDANDO) // AGUARDANDO, EM_ATENDIMENTO, CONCLUIDO, FALTOU, CANCELADO

  // Procedimentos múltiplos efetuados no atendimento
  procedimentos        AtendimentoProcedimentoRealizado[]

  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @updatedAt

  @@map("agendamentos_centro")
}

enum ModoDataAgendamento {
  AUTODATA
  MANUAL
  RETROATIVO
}

enum StatusAgendamentoCentro {
  AGUARDANDO
  EM_ATENDIMENTO
  CONCLUIDO
  FALTOU
  CANCELADO
}
```

---

## 3. Endpoints da API HTTP (`/v1/*`)

### 3.1 Disparo de Notificações por Ausência / Mudança de Data do Médico

- **POST** `/v1/centro/notificacoes/ausencia-medica`
- **Body:**

```json
{
	"medicoNome": "Dr. Roberto Medeiros",
	"dataAfetada": "2026-08-10",
	"tipoMotivo": "FALTA_MEDICA", // FALTA_MEDICA, MUDANCA_DIA, FERIAS_LICENCA
	"novaData": "2026-08-17",
	"mensagem": "Prezado(a) paciente, sua consulta do dia 10/08 foi remanejada para 17/08.",
	"canais": {
		"app": true,
		"sms": true,
		"whatsapp": true
	}
}
```

- **Resposta Sucesso (`200 OK`):**

```json
{
	"sucesso": true,
	"pacientesNotificados": 14,
	"dataDisparo": "2026-08-03T09:50:00.000Z"
}
```

---

### 3.2 Remarcar Atendimento na Fila de Regulação

- **POST** `/v1/encaminhamentos/:id/remarcar`
- **Body:**

```json
{
	"novaData": "2026-08-25",
	"novoHorario": "10:30",
	"unidadeDestino": "Centro de Especialidades Médicas (CEM)",
	"motivo": "Solicitação de reagendamento pelo paciente por motivos de trabalho."
}
```

- **Lógica no Server:**
  1. Atualiza o campo `agendamentoPrevisto` do encaminhamento para `${novaData}T${novoHorario}:00Z`.
  2. Insere evento de auditoria no histórico da timeline (`tipo: REMARCACAO`).
  3. **Preserva** a data original de criação (`criadoEm`), o grau de prioridade clínica (`URGENTE`/`PRIORITARIA`/`ELETIVA`) e a posição relativa na fila de espera.

---

### 3.3 Cadastrar Atendimento de Balcão Retroativo

- **POST** `/v1/centro/balcao/agendar`
- **Body:**

```json
{
	"pacienteId": "pac-123",
	"especialidade": "Cardiologia",
	"tipoServico": "PROCEDIMENTO",
	"procedimentoSolicitado": "02.11.02.003-6 - Eletrocardiograma (ECG)",
	"modoData": "RETROATIVO",
	"dataRetroativa": "2026-07-28",
	"horaRetroativa": "14:00",
	"statusRetroativo": "CONCLUIDO"
}
```

- **Resposta Sucesso (`201 Created`):**

```json
{
	"id": "agend-999",
	"protocolo": "BALCAO-2026-0728-0012",
	"status": "CONCLUIDO",
	"mensagem": "Atendimento retroativo registrado no histórico do paciente."
}
```

---

### 3.4 Adicionar Múltiplos Procedimentos a um Atendimento

- **POST** `/v1/centro/atendimentos/:id/procedimentos`
- **Body:**

```json
{
	"procedimentos": [
		{
			"codigoSigtap": "02.11.02.003-6",
			"nome": "Eletrocardiograma (ECG)",
			"quantidade": 1,
			"valorUnitario": 14.88
		},
		{
			"codigoSigtap": "04.04.01.001-2",
			"nome": "Biópsia de Pele e Subcutâneo",
			"quantidade": 2,
			"valorUnitario": 45.0
		}
	]
}
```

---

### 3.5 Reagendamento / Realocação Manual de Volta TFD (Escolha de Data)

- **POST** `/v1/tfd/solicitacoes/:id/aprovar`
- **Body:**

```json
{
	"modoAlocacao": "MANUAL",
	"dataManual": "2026-08-30",
	"observacoes": "Realocação manual de retorno a pedido da família sem uso da tabela automática."
}
```

- **Lógica no Server:**
  - Define a data informada `dataManual` diretamente no bilhete de volta sem acionar o algoritmo de encaixe automático em lote.

---

## 4. Tabela Padrão de Erros HTTP

| Código HTTP                | Causa                                                   | Mensagem Padrão                                                                    |
| :------------------------- | :------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| `400 Bad Request`          | Falta de justificativa de remarcação ou campos de data. | `{"erro": "Descreva o motivo da remarcação (mínimo 5 caracteres)."}`               |
| `404 Not Found`            | Encaminhamento ou agendamento não encontrado.           | `{"erro": "Encaminhamento não localizado na fila de regulação."}`                  |
| `422 Unprocessable Entity` | Tentativa de agendamento retroativo em data futura.     | `{"erro": "Agendamento retroativo deve ter data inferior ou igual à data atual."}` |
