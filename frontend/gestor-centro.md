# 📘 ESPECIFICAÇÃO DE INTEGRAÇÃO DO BACKEND — ERP GESTÃO & DIRETORIA DO CENTRO DE ESPECIALIDADES (v3.1.0)

Documentação técnica completa dos contratos HTTP REST, payloads de entrada/saída, validações de segurança e esquemas de dados consumidos pela interface **ERP Gestão Executiva** do Centro Municipal de Especialidades do UniSISM (`/centro/gestao/*`).

---

## 🔒 1. PADRÕES DE AUTENTICAÇÃO E SEGURANÇA

Todas as requisições enviadas pelo frontend aos endpoints deste módulo contêm rigorosamente os seguintes cabeçalhos HTTP:

```http
Authorization: Bearer <jwt_token>
Accept: application/json
```

> **Regra de Controle de Acesso (RBAC):**
> Os endpoints deste módulo só devem aceitar requisições de usuários autenticados cujas roles (`role`) sejam:
>
> - `COORDENADOR_UBS` (Direção/Coordenação Executiva do Centro)
> - `REGULADOR_SMS` (Supervisão da Regulação Municipal)
> - `ADMIN` (Administrador do Sistema)
> - `DESENVOLVEDOR` (Acesso Técnico)

---

## 📊 2. MÓDULO 1: TORRE DE CONTROLE EXECUTIVA (DASHBOARD)

### 2.1 GET `/v1/centro/gestao/dashboard`

Retorna os indicadores operacionais em tempo real e consolidados mensais do Centro de Especialidades.

- **Método:** `GET`
- **Rota:** `/v1/centro/gestao/dashboard`
- **Status de Sucesso:** `200 OK`

#### **Resposta JSON (200 OK):**

```json
{
	"hoje": {
		"totalAgendados": 145,
		"aguardandoAtendimento": 32,
		"emAtendimento": 18,
		"concluidos": 85,
		"faltas": 10
	},
	"mesAtual": {
		"periodo": "2026-07",
		"totalAgendados": 3200,
		"totalConcluidos": 2750,
		"totalFaltas": 450,
		"taxaAbsenteismoPorcento": 14.0
	},
	"distribuicaoPorEspecialidade": {
		"Cardiologia": 850,
		"Oftalmologia": 1100,
		"Dermatologia": 550,
		"Ortopedia": 700
	},
	"distribuicaoPorUbs": {
		"UBS Central - Bairro Novo": 1200,
		"UBS Vila Esperança": 850,
		"UBS São José": 650,
		"UBS Rural - Linha IV": 500
	},
	"totalEscalasAtivas": 18
}
```

---

## 👥 3. MÓDULO 2: GESTÃO DE EQUIPES & USUÁRIOS (ADMIN USER MANAGEMENT)

### 3.1 GET `/v1/admin/usuarios`

Lista todos os profissionais de saúde e operadores cadastrados no município com filtros opcionais.

- **Método:** `GET`
- **Rota:** `/v1/admin/usuarios`
- **Query Parameters:**
  - `q` (opcional, string): Busca por nome, CPF, e-mail ou matrícula.
  - `role` (opcional, string): `MEDICO`, `REGULADOR_SMS`, `ATENDENTE_UBS`, `COORDENADOR_UBS`, `ADMIN`.
  - `ativo` (opcional, boolean): `true` ou `false`.
  - `limit` (opcional, number): Máximo de registros (Padrão: 1000).

#### **Resposta JSON (200 OK):**

```json
[
	{
		"id": "usr-uuid-001",
		"nome": "Dr. Fernando Souza",
		"matricula": "MAT-4482",
		"email": "fernando.souza@saude.gov.br",
		"cpf": "12345678900",
		"role": "MEDICO",
		"ativo": true,
		"criadoEm": "2025-01-10T08:00:00Z",
		"ubs": null,
		"prefeitura": { "id": "pref-01", "nome": "Prefeitura Sede" }
	}
]
```

---

### 3.2 POST `/v1/admin/usuarios`

Cadastra um novo profissional de saúde / usuário no banco de dados do servidor.

- **Método:** `POST`
- **Rota:** `/v1/admin/usuarios`
- **Headers:** `Content-Type: application/json`

#### **Payload de Entrada (Body JSON):**

```json
{
	"nome": "Dra. Ana Paula Silveira",
	"cpf": "98765432100",
	"email": "ana.silveira@saude.gov.br",
	"matricula": "CRM 99887",
	"role": "MEDICO",
	"senha": "Mudar@123"
}
```

#### **Resposta JSON (201 Created):**

```json
{
	"id": "usr-uuid-002",
	"nome": "Dra. Ana Paula Silveira",
	"email": "ana.silveira@saude.gov.br",
	"role": "MEDICO",
	"matricula": "CRM 99887"
}
```

---

### 3.3 PATCH `/v1/admin/usuarios/:id`

Atualiza dados cadastrais ou perfil de acesso de um profissional.

- **Método:** `PATCH`
- **Rota:** `/v1/admin/usuarios/:id`
- **Payload de Entrada (Body JSON):**

```json
{
	"nome": "Dra. Ana Paula Silveira Santos",
	"email": "ana.santos@saude.gov.br",
	"role": "MEDICO"
}
```

---

### 3.4 POST `/v1/admin/usuarios/:id/ativo`

Ativa ou inativa o acesso de um usuário no sistema.

- **Método:** `POST`
- **Rota:** `/v1/admin/usuarios/:id/ativo`
- **Payload (Body JSON):** `{ "ativo": false }`
- **Resposta (200 OK):** `{ "id": "usr-uuid-002", "ativo": false }`

---

### 3.5 POST `/v1/admin/usuarios/:id/reset-senha`

Redefine a senha de um profissional de saúde.

- **Método:** `POST`
- **Rota:** `/v1/admin/usuarios/:id/reset-senha`
- **Payload (Body JSON):** `{ "novaSenha": "UniSISM@2026" }`
- **Resposta (200 OK):** `{ "sucesso": true }`

---

## 📅 4. MÓDULO 3: MATRIZ DE COTAS & ESCALAS MÉDICAS

### 4.1 GET `/v1/centro/gestao/cotas`

Lista as cotas mensais de agendamento alocadas por UBS.

- **Método:** `GET`
- **Resposta JSON (200 OK):**

```json
[
	{
		"ubsId": "ubs-1",
		"ubsNome": "UBS Central - Bairro Novo",
		"totalCotasMes": 350,
		"alocadas": 295,
		"disponiveis": 55,
		"status": "NORMAL",
		"especialidades": {
			"Cardiologia": 80,
			"Oftalmologia": 100,
			"Dermatologia": 50,
			"Ortopedia": 70,
			"Neurologia": 50
		}
	}
]
```

---

### 4.2 PUT `/v1/centro/gestao/cotas/:ubsId`

Atualiza a matriz de cotas de uma UBS.

- **Método:** `PUT`
- **Rota:** `/v1/centro/gestao/cotas/:ubsId`
- **Body:**

```json
{
	"ubsId": "ubs-1",
	"totalCotasMes": 400,
	"especialidades": {
		"Cardiologia": 100,
		"Oftalmologia": 120,
		"Dermatologia": 60,
		"Ortopedia": 70,
		"Neurologia": 50
	}
}
```

---

### 4.3 GET `/v1/centro/gestao/escalas` & POST `/v1/centro/gestao/escalas`

Listagem e cadastro de escalas de trabalho dos médicos no Centro de Especialidades.

- **GET `/v1/centro/gestao/escalas`** -> Retorna array `EscalaMedicoCentro[]`.
- **POST `/v1/centro/gestao/escalas`** -> Body JSON:

```json
{
	"medicoNome": "Dr. Fernando Souza",
	"crm": "CRM 34120",
	"especialidade": "Cardiologia",
	"diasSemana": ["SEG", "QUA", "SEX"],
	"horarioInicio": "08:00",
	"horarioFim": "12:00",
	"duracaoMinutos": 20,
	"vagasPorTurno": 12,
	"status": "ATIVA"
}
```

---

### 4.4 POST `/v1/centro/gestao/remanejamento-lote`

Executa o remanejamento emergencial em lote dos pacientes de uma agenda afetada por imprevistos.

- **Método:** `POST`
- **Rota:** `/v1/centro/gestao/remanejamento-lote`
- **Payload (Body JSON):**

```json
{
	"medicoOrigem": "Dr. Roberto Medeiros",
	"dataOrigem": "2026-07-27",
	"medicoDestino": "Dra. Sandra Regina",
	"dataDestino": "2026-07-28",
	"notificarSms": true
}
```

#### **Resposta JSON (200 OK):**

```json
{
	"totalRemanejados": 8,
	"dataDestino": "2026-07-28",
	"medicoDestino": "Dra. Sandra Regina"
}
```

---

## 🏥 5. MÓDULO 4: CONSULTÓRIOS & INFRAESTRUTURA

### 5.1 GET `/v1/centro/gestao/salas` & POST `/v1/centro/gestao/salas`

Gerenciamento de consultórios médicos e salas de exames funcionais do Centro.

- **GET `/v1/centro/gestao/salas`** -> Retorna lista de consultórios.
- **POST `/v1/centro/gestao/salas`** -> Body JSON:

```json
{
	"codigo": "CONS-05",
	"nome": "Consultório 05 — Ortopedia",
	"especialidadePrincipal": "Ortopedia",
	"status": "DISPONIVEL",
	"equipamentos": ["Maca Articulada", "Raio-X Digital", "Foco Auxiliar"],
	"ala": "Ala A — Térreo"
}
```

- **PUT `/v1/centro/gestao/salas/:id`** -> Atualiza estado da sala (`status`: `DISPONIVEL`, `EM_ATENDIMENTO`, `MANUTENCAO`, `RESERVADA`).

---

## 📑 6. MÓDULO 5: CATÁLOGO DE ESPECIALIDADES & TABELA SIGTAP / SUS

### 6.1 GET `/v1/centro/gestao/especialidades` & POST `/v1/centro/gestao/especialidades`

Gerenciador do catálogo de procedimentos especializados habilitados na rede municipal.

- **GET `/v1/centro/gestao/especialidades`** -> Lista especialidades ativas.
- **POST `/v1/centro/gestao/especialidades`** -> Body JSON:

```json
{
	"nome": "Neurologia Clínica",
	"codigoSigtap": "03.01.01.007-6",
	"tempoPadraoMinutos": 20,
	"valorTabelaBrl": 100.0,
	"documentosObrigatorios": ["Laudo de Tomografia ou Ressonância se houver"],
	"preparoRequerido": "Trazer exames neurológicos prévios.",
	"ativa": true
}
```

---

## 📈 7. MÓDULO 6: PRESTAÇÃO DE CONTAS BPA / SIA-SUS & AUDITORIA CFM

### 7.1 GET `/v1/centro/gestao/relatorios/bpa`

Gera o relatório oficial faturável de produção ambulatorial BPA / SIA-SUS.

- **Método:** `GET`
- **Rota:** `/v1/centro/gestao/relatorios/bpa?periodo=YYYY-MM`
- **Resposta JSON (200 OK):**

```json
{
	"periodo": "2026-07",
	"totalAtendimentos": 2750,
	"porEspecialidade": {
		"Cardiologia": 850,
		"Oftalmologia": 1100,
		"Dermatologia": 550,
		"Ortopedia": 250
	},
	"itens": [
		{
			"protocolo": "ENC20260727-001",
			"pacienteNome": "Maria Eduarda Silva",
			"pacienteCpf": "123.456.789-00",
			"pacienteCartaoSus": "898000123456789",
			"especialidade": "Cardiologia",
			"cid10": "I10",
			"profissional": "Dr. Fernando Souza",
			"dataAgendada": "2026-07-27"
		}
	]
}
```

---

### 7.2 GET `/v1/centro/gestao/auditoria`

Consulta a trilha de auditoria imutável do sistema para conformidade com resolução CFM nº 1.821/2007.

- **Método:** `GET`
- **Rota:** `/v1/centro/gestao/auditoria?limit=50&offset=0`
- **Resposta JSON (200 OK):**

```json
{
	"total": 1420,
	"logs": [
		{
			"id": "log-101",
			"timestamp": "2026-07-27T10:12:44Z",
			"operador": "Dr. Fernando Souza (CRM 34120)",
			"papel": "MEDICO",
			"acao": "ATENDIMENTO_CONCLUIDO",
			"detalhes": "Consulta concluída para o paciente Mateus Henrique Silva (CID-10: I10).",
			"ip": "192.168.10.45"
		}
	]
}
```

---

## 🛡️ 8. RESUMO DE CONFORMIDADE DO FRONTEND

- **Zero Mock Data:** Todas as 6 telas da diretoria executiva iniciam em estado limpo (`[]` ou `null`) e consomem estritamente as respostas JSON dos endpoints acima.
- **Tratamento de Exceções:** Falhas HTTP (400, 401, 403, 404, 500) exibem alertas amigáveis com a mensagem original retornada pelo servidor.
