# 🩺 ESPECIFICAÇÃO DE INTEGRAÇÃO DO BACKEND — MÓDULO MÉDICO & ATENDIMENTO ERP (v3.1.0)

Documentação técnica dos contratos HTTP REST, esquemas de dados, prontuário eletrônico (PEP) e requisições do módulo **Médico Especialista & Consultório Digital SOAP** do UniSISM (`/centro/medico/*`).

---

## 🔒 1. AUTENTICAÇÃO E PERMISSÕES (RBAC)

Todas as chamadas contêm os cabeçalhos:
```http
Authorization: Bearer <jwt_token>
Accept: application/json
```

> **Perfis de Acesso Autorizados:**
> - `MEDICO` (Médico Especialista)
> - `COORDENADOR_UBS` (Coordenador com perfil assistencial)
> - `ADMIN` / `DESENVOLVEDOR`

---

## 📋 2. ENDPOINTS DO CONSULTÓRIO DIGITAL MÉDICO

### 2.1 GET `/v1/centro/medico/agenda`
Retorna a lista de pacientes agendados para a consulta do especialista no dia.

* **Método:** `GET`
* **Rota:** `/v1/centro/medico/agenda?data=YYYY-MM-DD`
* **Query Parameters:** `data` (opcional, padrão: data atual).

#### **Resposta JSON (200 OK):**
```json
{
  "data": "2026-07-27",
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
        "endereco": "Rua Central, 120 - Bairro Novo"
      },
      "solicitacao": {
        "medicoSolicitante": "Dr. Carlos Moreira",
        "crm": "CRM 45892",
        "especialidadeSolicitada": "Cardiologia",
        "cid10": "I10",
        "cidDescricao": "Hipertensão Essencial",
        "justificativaClinica": "Picos hipertensivos recorrentes apesar de medicação em dose máxima.",
        "prioridade": "PRIORITARIA",
        "dataSolicitacao": "2026-07-20"
      },
      "unidadeOrigem": "UBS Central - Bairro Novo",
      "observacoesRegulacao": "Encaixe prioritário autorizado pela regulação."
    }
  ]
}
```

---

### 2.2 POST `/v1/centro/medico/atendimentos/:id/chamar`
Aciona a chamada do paciente na sala de espera (painel e notificação sonora).

* **Método:** `POST`
* **Rota:** `/v1/centro/medico/atendimentos/:id/chamar`
* **Resposta (200 OK):** `{ "sucesso": true, "status": "EM_ATENDIMENTO" }`

---

### 2.3 GET `/v1/centro/medico/prontuario/:pacienteId`
Obtém o Prontuário Eletrônico Unificado (PEP) do paciente contendo histórico de consultas anteriores, alergias, condições crônicas e exames.

* **Método:** `GET`
* **Rota:** `/v1/centro/medico/prontuario/:pacienteId`

#### **Resposta JSON (200 OK):**
```json
{
  "pacienteId": "pac-uuid-001",
  "alergias": ["Dipirona", "Penicilina"],
  "condicoesCronicas": ["Hipertensão Arterial", "Diabetes Tipo 2"],
  "medicamentosEmUso": [
    { "nome": "Losartana Potássica", "dosagem": "50mg", "frequencia": "12/12h" }
  ],
  "historicoAtendimentos": [
    {
      "id": "atend-01",
      "data": "2026-05-10",
      "especialidade": "Clínica Geral",
      "medicoNome": "Dr. Carlos Moreira",
      "cid10": "I10",
      "conduta": "Solicitado encaminhamento para Cardiologia."
    }
  ]
}
```

---

### 2.4 POST `/v1/centro/medico/atendimentos/:id/soap`
Registra a consulta médica SOAP finalizada, assinando o PEP no banco de dados.

* **Método:** `POST`
* **Rota:** `/v1/centro/medico/atendimentos/:id/soap`
* **Headers:** `Content-Type: application/json`

#### **Payload de Entrada (Body JSON):**
```json
{
  "queixaPrincipal": "Paciente refere melhora das palpitações, em uso regular das medicações.",
  "exameFisico": "PA: 120/80 mmHg, FC: 72 bpm, Peso: 70.5kg, Altura: 170cm, SpO2: 98%. Ausculta cardíaca normal.",
  "cid10": "I10",
  "diagnostico": "Hipertensão arterial essencial controlada.",
  "conduta": "Mantida prescrição. Retorno em 60 dias para reavaliação.",
  "prescricao": "1. Losartana Potássica 50mg - 1 comp 12/12h\n2. Atenolol 50mg - 1 comp de manhã",
  "pressaoArterial": "120/80",
  "frequenciaCardiaca": "72",
  "peso": "70.5"
}
```

#### **Resposta JSON (200 OK):**
```json
{
  "sucesso": true,
  "id": "enc-uuid-101",
  "statusAtendimentoCentro": "CONCLUIDO",
  "concluidoEm": "2026-07-27T16:30:00Z"
}
```

---

### 2.5 POST `/v1/centro/medico/encaminhamento-intermunicipal`
Encaminha o paciente para alta complexidade ou regulação em município de referência (TFD).

* **Método:** `POST`
* **Rota:** `/v1/centro/medico/encaminhamento-intermunicipal`
* **Payload (Body JSON):**
```json
{
  "encaminhamentoId": "enc-uuid-101",
  "municipioDestino": "Porto Alegre",
  "especialidade": "Oncologia Cirúrgica",
  "cid10": "C50.9",
  "diagnostico": "Neoplasia maligna da mama",
  "justificativa": "Tratamento cirúrgico de alta complexidade e radioterapia não disponíveis na rede municipal.",
  "prioridade": "URGENTE",
  "transporteRequerido": "VAN_SMS",
  "requerAcompanhante": true
}
```

#### **Resposta JSON (201 Created):**
```json
{
  "protocolo": "TFD20260727-889",
  "criadoEm": "2026-07-27T16:30:05Z",
  "municipioDestino": "Porto Alegre",
  "status": "AGUARDANDO_VAGA_ESTADUAL"
}
```

---

## 🛡️ CONFORMIDADE CFM & USABILIDADE MÉDICA
- **Cálculo Automático de IMC**: Calculado no cliente a partir de Peso (kg) e Altura (cm) com classificação da OMS.
- **Inserção de Prescrição REMUME**: Seleção em 1-clique de medicamentos padronizados da farmácia pública municipal.
- **Sugestão de CIDs Frequentes**: Acesso instantâneo a CIDs comuns da especialidade.
- **Zero Mock Data**: Operação em produção consumindo respostas dos endpoints da API REST.
