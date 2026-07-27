# 🩺 ESPECIFICAÇÃO DE INTEGRAÇÃO DO BACKEND — MÓDULO DE ATENDIMENTO CONSULTÓRIO DIGITAL CEM & CEO (v4.0.0)

Documentação técnica dos contratos HTTP REST, esquemas de dados, prontuário eletrônico (PEC/PEP), regulação de encaminhamentos e formulários de atendimento do **CEM (Centro de Especialidades Médicas)** e do **CEO (Centro de Especialidades Odontológicas)**.

---

## 🔒 1. AUTENTICAÇÃO E PERMISSÕES (RBAC)

Todas as requisições enviadas ao módulo de atendimento do CEM (`/cem/medico/*`) ou do CEO (`/ceo/medico/*`) exigem:

```http
Authorization: Bearer <jwt_token>
Accept: application/json
Content-Type: application/json
```

> **Perfis de Acesso Autorizados:**
> - `MEDICO` (Médicos do CEM e Dentistas do CEO)
> - `COORDENADOR_UBS` (Coordenação com perfil assistencial)
> - `ADMIN` / `DESENVOLVEDOR`

---

## 🏛️ 2. SEPARAÇÃO DE DADOS CEM E CEO NO BANCO DE DADOS

O banco de dados armazena o campo `filaDestino` na tabela `encaminhamentos`:
- **CEM (Centro de Especialidades Médicas)**: `filaDestino = 'CENTRO_ESPECIALIDADES'`
- **CEO (Centro de Especialidades Odontológicas)**: `filaDestino = 'CEO'`
- **Fila Regional / TFD**: `filaDestino = 'SUS'`

A API backend deve isolar os agendamentos de forma que o profissional logado no CEM visualize apenas a agenda do CEM, e o profissional logado no CEO visualize apenas a agenda do CEO.

---

## 📋 3. ENDPOINTS REST DO CONSULTÓRIO DIGITAL

### 3.1 GET `/v1/centro/medico/agenda`
Retorna a agenda de atendimentos do profissional no dia.

* **Método:** `GET`
* **Rota:** `/v1/centro/medico/agenda?data=YYYY-MM-DD`
* **Query Parameters:**
  - `data`: data no formato `YYYY-MM-DD` (padrão: data atual)
  - `centro`: `CENTRO_ESPECIALIDADES` (CEM) | `CEO` (CEO)

#### **Resposta JSON (200 OK):**
```json
{
  "data": "2026-07-27",
  "centro": "CENTRO_ESPECIALIDADES",
  "agenda": [
    {
      "id": "enc-uuid-101",
      "protocolo": "ENC20260727-001",
      "statusAtendimentoCentro": "AGUARDANDO",
      "paciente": {
        "id": "pac-uuid-001",
        "nome": "Maria Eduarda Silva",
        "cpf": "123.456.789-00",
        "cartaoSus": "898000123456789",
        "dataNascimento": "1978-05-14",
        "sexo": "F",
        "telefone": "(51) 99887-1122",
        "endereco": "Rua Central, 120"
      },
      "solicitacao": {
        "medicoSolicitante": "Dr. Carlos Moreira",
        "crm": "CRM 45892",
        "especialidadeSolicitada": "Cardiologia Pediátrica",
        "cid10": "I10",
        "cidDescricao": "Hipertensão Essencial",
        "justificativaClinica": "Picos hipertensivos recorrentes.",
        "prioridade": "PRIORITARIA",
        "dataSolicitacao": "2026-07-20"
      },
      "unidadeOrigem": "UBS Central",
      "observacoesRegulacao": "Aprovado pela Regulação SMS."
    }
  ]
}
```

---

### 3.2 POST `/v1/encaminhamentos` (Novo Encaminhamento pelo Médico/Dentista)
Permite ao médico do CEM ou dentista do CEO criar uma **nova solicitação de encaminhamento** durante a consulta para ser regulada pela Secretaria de Saúde (SMS).

* **Método:** `POST`
* **Rota:** `/v1/encaminhamentos`
* **Payload (Body JSON):**
```json
{
  "paciente": {
    "nome": "Maria Eduarda Silva",
    "cpf": "123.456.789-00",
    "cartaoSus": "898000123456789",
    "dataNascimento": "1978-05-14",
    "sexo": "F",
    "telefone": "(51) 99887-1122",
    "endereco": "Rua Central, 120"
  },
  "solicitacao": {
    "medicoSolicitante": "Dr. Roberto Medeiros",
    "crm": "CRM 12345",
    "especialidadeSolicitada": "Cirurgia Vascular",
    "cid10": "I73.9",
    "cidDescricao": "Doença vascular periférica não especificada",
    "justificativaClinica": "Paciente necessita de avaliação especializada em Cirurgia Vascular devido a claudicação intermitente severa.",
    "prioridade": "URGENTE",
    "dataSolicitacao": "2026-07-27"
  }
}
```

#### **Resposta (201 Created):**
```json
{
  "id": "enc-uuid-999",
  "protocolo": "ENC20260727-0999",
  "status": "AGUARDANDO_REGULACAO",
  "criadoEm": "2026-07-27T17:41:00Z"
}
```

---

### 3.3 POST `/v1/centro/medico/atendimentos/:id/soap`
Finaliza o atendimento gravando os dados clínicos no Prontuário Eletrônico (PEC/PEP).

* **Método:** `POST`
* **Rota:** `/v1/centro/medico/atendimentos/:id/soap`
* **Payload (Body JSON):**
```json
{
  "queixaPrincipal": "Paciente refere melhora após início da medicação.",
  "exameFisico": "PA: 120/80 mmHg, FC: 72 bpm, Peso: 70.5kg, Altura: 170cm, SpO2: 98%.",
  "cid10": "I10",
  "diagnostico": "Hipertensão arterial essencial controlada.",
  "conduta": "Mantida prescrição. Retorno em 60 dias para reavaliação.",
  "prescricao": "1. Losartana Potássica 50mg - 1 comp 12/12h\n2. Atenolol 50mg - 1 comp de manhã",
  "pressaoArterial": "120/80",
  "frequenciaCardiaca": "72",
  "peso": "70.5"
}
```

#### **Resposta (200 OK):**
```json
{
  "sucesso": true,
  "id": "enc-uuid-101",
  "statusAtendimentoCentro": "CONCLUIDO",
  "concluidoEm": "2026-07-27T17:41:05Z"
}
```

---

## 🛡️ CONFORMIDADE E USABILIDADE MÉDICA
- **Cálculo Automático de IMC**: Calculado no cliente a partir de Peso (kg) e Altura (cm) com classificação da OMS.
- **Inserção de Prescrição REMUME**: Seleção em 1-clique de medicamentos padronizados da farmácia pública municipal.
- **Sugestão de CIDs Frequentes**: Acesso instantâneo a CIDs comuns da especialidade.
- **Transmissão Automática para a Regulação**: Encaminhamentos criados pelo profissional caem diretamente na fila de triagem da Secretaria Municipal de Saúde.
- **Zero Mock Data**: Operação em produção consumindo respostas dos endpoints da API REST.
