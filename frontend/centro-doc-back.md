# UNISISM · Guia Completo de Integração de Backend — Centros de Especialidades CEM & CEO (v4.0.0)

Documentação técnica dos contratos HTTP REST, regras de isolamento de dados no banco de dados (Multi-Tenancy), autenticação JWT/RBAC e fluxos de regulação entre a Secretaria de Saúde (SMS), o **CEM (Centro de Especialidades Médicas)** e o **CEO (Centro de Especialidades Odontológicas)**.

---

## 🏛️ 1. VISÃO GERAL E ARQUITETURA MULTI-ÓRGÃO

O ecossistema UniSISM divide a atenção secundária municipal em **dois órgãos autônomos e especializados**:

1. **CEM (Centro de Especialidades Médicas)** — Rota Frontend `/cem/*` (ou `/centro/*`)
   - Atendimento médico secundário em Cardiologia, Neurologia, Endocrinologia, Dermatologia, Ginecologia, Ortopedia, exames de imagem e diagnósticos funcionais.
   - Identificador no Banco de Dados: `filaDestino = 'CENTRO_ESPECIALIDADES'` (ou `'CENTRO_ESPECIALIDADES_MEDICAS'`).

2. **CEO (Centro de Especialidades Odontológicas)** — Rota Frontend `/ceo/*`
   - Atendimento odontológico especializado em Endodontia, Periodontia, Cirurgia Bucomaxilofacial, Odontopediatria, Pacientes com Necessidades Especiais (PNE) e Prótese.
   - Identificador no Banco de Dados: `filaDestino = 'CEO'` (ou `'CENTRO_ESPECIALIDADES_ODONTOLOGICAS'`).

---

## 🗄️ 2. MODELAGEM NO BANCO DE DADOS & ISOLAMENTO (MULTI-TENANCY)

### 2.1 Esquema da Tabela `encaminhamentos`

```sql
CREATE TABLE encaminhamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo VARCHAR(30) UNIQUE NOT NULL, -- Ex: ENC20260727-0001
    status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_REGULACAO', -- AGUARDANDO_REGULACAO, APROVADO, PENDENCIA_DOCUMENTO, REJEITADO, CONCLUIDO
    fila_destino VARCHAR(40) NOT NULL DEFAULT 'SUS', -- 'CENTRO_ESPECIALIDADES' (CEM), 'CEO', 'SUS'
    unidade_origem_id UUID REFERENCES unidades_saude(id),
    unidade_destino_id UUID REFERENCES unidades_saude(id), -- ID do CEM ou CEO
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    medico_solicitante_id UUID NOT NULL REFERENCES usuarios(id),
    especialidade_solicitada VARCHAR(100) NOT NULL,
    cid10 VARCHAR(10) NOT NULL,
    cid_descricao VARCHAR(255),
    justificativa_clinica TEXT NOT NULL,
    prioridade VARCHAR(20) NOT NULL DEFAULT 'ELETIVA', -- ELETIVA, PRIORITARIA, URGENTE, EMERGENCIA
    agendamento_previsto DATE,
    status_atendimento_centro VARCHAR(30), -- AGUARDANDO, EM_ATENDIMENTO, CONCLUIDO, AUSENTE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2.2 Regras de Isolamento de Dados no Banco de Dados

- **Usuários da Recepção/Médicos do CEM**: As consultas SQL executadas para o CEM filtram rigorosamente `WHERE fila_destino IN ('CENTRO_ESPECIALIDADES', 'CEM')`.
- **Usuários da Recepção/Dentistas do CEO**: As consultas SQL executadas para o CEO filtram rigorosamente `WHERE fila_destino = 'CEO'`.
- **Regulação da Secretaria de Saúde (SMS)**: O regulador enxerga a totalidade das solicitações municipais `WHERE status = 'AGUARDANDO_REGULACAO'` e tem a prerrogativa de definir o valor do campo `fila_destino` na aprovação.
- **Administradores e Desenvolvedores**: Acesso irrestrito a ambos os centros.

---

## 🔄 3. FLUXO END-TO-END DE REGULAÇÃO E ENCAMINHAMENTO

```
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                             FLUXO INTEGRADO CEM / CEO / SMS                            │
 └────────────────────────────────────────────────────────────────────────────────────────┘
  [1. UBS / Consultório]
     └─► POST /v1/encaminhamentos (Cria solicitação -> Status: AGUARDANDO_REGULACAO)
            │
            ▼
  [2. Secretaria de Saúde / Regulação SMS]
     └─► PATCH /v1/sms/regulacao/avaliar
            ├─► Opção A: filaDestino = 'CENTRO_ESPECIALIDADES' ──► Direciona para a Fila do CEM
            ├─► Opção B: filaDestino = 'CEO'                   ──► Direciona para a Fila do CEO
            └─► Opção C: filaDestino = 'SUS'                   ──► Fila Regional / Estado (TFD)
            │
            ├─────────────────────────────────────────┐
            ▼                                         ▼
  🟢 3A. RECEPÇÃO DO CEM                   🟢 3B. RECEPÇÃO DO CEO
   - GET /v1/centro/recepcao/fila-espera    - GET /v1/centro/recepcao/fila-espera?centro=CEO
   - POST /v1/centro/recepcao/agendar/:id   - POST /v1/centro/recepcao/agendar/:id
            │                                         │
            ▼                                         ▼
  🩺 4A. ATENDIMENTO MÉDICO (CEM)          🦷 4B. ATENDIMENTO ODONTOLÓGICO (CEO)
   - GET /v1/centro/medico/agenda           - GET /v1/centro/medico/agenda
   - POST /v1/centro/medico/atendimento     - POST /v1/centro/medico/atendimento
```

---

## 🔒 4. AUTENTICAÇÃO E PERMISSÕES (RBAC)

Todas as requisições exigem os cabeçalhos:

```http
Authorization: Bearer <jwt_token>
Accept: application/json
Content-Type: application/json
```

---

## 📡 5. ENDPOINTS REST E ESQUEMAS JSON

### 5.1 POST `/v1/encaminhamentos`

Cria uma nova solicitação de encaminhamento (pode ser enviada pela UBS ou criada diretamente pelo Médico/Dentista no consultório).

#### **Payload de Entrada (Body JSON):**

```json
{
	"paciente": {
		"nome": "Maria Eduarda Silva",
		"cpf": "123.456.789-00",
		"cartaoSus": "898000123456789",
		"dataNascimento": "1985-04-12",
		"sexo": "F",
		"telefone": "(51) 99887-1122",
		"endereco": "Rua Central, 120"
	},
	"solicitacao": {
		"medicoSolicitante": "Dr. Roberto Medeiros",
		"crm": "CRM 12345",
		"especialidadeSolicitada": "Cardiologia Pediátrica",
		"cid10": "I10",
		"cidDescricao": "Hipertensão Essencial",
		"justificativaClinica": "Paciente com picos hipertensivos constantes necessitando de acompanhamento no CEM.",
		"prioridade": "PRIORITARIA",
		"dataSolicitacao": "2026-07-27"
	}
}
```

#### **Resposta (201 Created):**

```json
{
	"id": "c1f7a8b2-1111-42b4-82a1-987654321000",
	"protocolo": "ENC20260727-0099",
	"status": "AGUARDANDO_REGULACAO",
	"criadoEm": "2026-07-27T17:40:00Z"
}
```

---

### 5.2 PATCH `/v1/sms/regulacao/lote`

Aprova e direciona encaminhamentos da Secretaria de Saúde para o **CEM**, **CEO** ou **Fila SUS**.

#### **Payload de Entrada (Body JSON):**

```json
{
	"ids": ["c1f7a8b2-1111-42b4-82a1-987654321000"],
	"acao": "APROVAR",
	"filaDestino": "CENTRO_ESPECIALIDADES", // Valores: 'CENTRO_ESPECIALIDADES' (CEM), 'CEO', 'SUS'
	"observacoes": "Aprovado para agendamento direto na atenção especializada municipal."
}
```

#### **Resposta (200 OK):**

```json
{
	"sucesso": true,
	"processados": 1,
	"status": "APROVADO",
	"filaDestino": "CENTRO_ESPECIALIDADES"
}
```

---

### 5.3 GET `/v1/centro/recepcao/fila-espera`

Consulta a fila de espera do **CEM** ou do **CEO**.

- **Query Parameters:**
  - `centro`: `CENTRO_ESPECIALIDADES` (CEM) | `CEO` (CEO) (Padrão: `CENTRO_ESPECIALIDADES`)
  - `status`: `APROVADO` | `TODOS`

#### **Resposta (200 OK):**

```json
{
	"total": 1,
	"encaminhamentos": [
		{
			"id": "c1f7a8b2-1111-42b4-82a1-987654321000",
			"protocolo": "ENC20260727-0099",
			"status": "APROVADO",
			"filaDestino": "CENTRO_ESPECIALIDADES",
			"paciente": {
				"nome": "Maria Eduarda Silva",
				"cpf": "123.456.789-00",
				"cartaoSus": "898000123456789"
			},
			"solicitacao": {
				"especialidadeSolicitada": "Cardiologia Pediátrica",
				"prioridade": "PRIORITARIA",
				"cid10": "I10"
			}
		}
	]
}
```

---

### 5.4 POST `/v1/centro/medico/atendimentos/:id/soap`

Registra a consulta médica (CEM) ou atendimento odontológico (CEO) com assinatura no PEP.

#### **Payload de Entrada (Body JSON):**

```json
{
	"queixaPrincipal": "Paciente refere melhora após início da medicação.",
	"exameFisico": "PA: 120/80 mmHg, FC: 72 bpm, Peso: 70.5kg, Altura: 170cm.",
	"cid10": "I10",
	"diagnostico": "Hipertensão arterial essencial controlada.",
	"conduta": "Retorno em 60 dias.",
	"prescricao": "1. Losartana 50mg - 1 comp 12/12h",
	"pressaoArterial": "120/80",
	"frequenciaCardiaca": "72",
	"peso": "70.5"
}
```

---

## 🛡️ CONFORMIDADE E GARANTIA DE DADOS

- **Isolamento Total**: Registros do CEM e do CEO são filtrados via `filaDestino` no banco de dados.
- **Zero Mock Data**: Todas as telas do frontend consomem estritamente as respostas da API REST.
- **Auditoria Imutável**: Ações de agendamento, atendimento e regulação são gravadas na tabela de logs de auditoria do sistema.
