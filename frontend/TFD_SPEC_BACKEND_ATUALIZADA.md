# UNISISM - Guia de Atualização da Especificação de Backend: Módulo TFD

Este documento contém a especificação técnica completa e atualizada para o backend do **Módulo TFD (Tratamento Fora do Domicílio)** do UniSISM, cobrindo os 5 grandes ajustes e regras de negócio de alocação, auditoria de quilometragem e registro tardio.

---

## 1. Resumo dos Ajustes & Regras de Negócio

| Regra / Ajuste | Descrição da Regra | Comportamento do Backend |
| :--- | :--- | :--- |
| **1. Validação Completa de Campos** | Todos os campos do paciente (Nome, CPF, Data Nasc, Tel, Endereço, UBS, Especialidade, Destino, Data Desejada, Motivo) e acompanhante devem estar preenchidos. | Recusar submissão com `HTTP 400 Bad Request` se houver campos obrigatórios ausentes. |
| **2. Anexo & Fluxo Duplo (Alocação vs Regulação)** | O anexo (foto do encaminhamento/laudo/consulta) determina a rota da solicitação. | **COM ANEXO:** Solicitação é aprovada com prioridade para **alocação automática imediata** da vaga (veículo, data e assento).<br>**SEM ANEXO:** Solicitação fica no status `PENDENTE` na **Fila de Espera da Regulação TFD** para análise manual do gestor. |
| **3. Registro Tardio / Retroativo** | Viagens/atendimentos de emergência realizados (ex: final de semana, SAMU, transporte emergencial) sem protocolo prévio. | Salvar solicitação com `isRegistroTardio: true` e status direto como `REALIZADA` (solicitação) ou `CONCLUIDA` (viagem). |
| **4. Lançamento de KM pelo Gestor (Carro Baixo)** | Prevenção de irregularidades no uso de carros baixos e ambulâncias. | O Gestor registra a quilometragem inicial e final (`kmInicialHodometro` e `kmFinalHodometro`) diretamente, sem depender de prévia do motorista. |
| **5. Trava Antifraude de Conclusão & Alocação Manual** | Permite alocação manual para carros baixos e exige validação de recursos antes de encerrar. | Não permite concluir viagem se `veiculoId`, `motoristaId`, `kmInicialHodometro` e `kmFinalHodometro` não estiverem preenchidos (`HTTP 422 Unprocessable Entity`). |

---

## 2. Atualização dos Schemas Prisma / Banco de Dados

### 2.1 Modelo `SolicitacaoTFD`

```prisma
model SolicitacaoTFD {
  id                         String                @id @default(uuid())
  protocolo                  String                @unique // Ex: TFD-2026-0803-XXXX
  pacienteCpf                String
  pacienteNome               String
  pacienteDataNasc           DateTime
  pacienteTelefone           String
  pacienteEndereco           String
  pacienteCartaoSus          String?
  pacienteNomeMae            String?
  pacienteRg                 String?
  pacienteBairro             String?
  pacienteMunicipio          String?
  pacienteUf                 String?
  pacienteCep                String?
  
  ubsId                      String
  ubs                        Ubs                   @relation(fields: [ubsId], references: [id])
  especialidade              String
  destino                    String
  unidadeDestino             String?
  motivo                     String
  dataDesejada               DateTime
  prioridade                 PrioridadeSolicitacaoTFD @default(ROUTINA) // ROUTINA, PRIORITARIA, URGENTE
  status                     StatusSolicitacaoTFD     @default(PENDENTE) // PENDENTE, APROVADA, NEGADA, ALOCADA, REALIZADA, CANCELADA

  // Acompanhante
  acompanhanteNecessario     Boolean               @default(false)
  acompanhanteNome           String?
  acompanhanteCpf            String?
  acompanhanteDataNasc       DateTime?
  acompanhanteTelefone       String?
  acompanhanteParentesco     String?
  acompanhanteRg             String?

  // Registro Tardio / Lançamento Retroativo
  isRegistroTardio           Boolean               @default(false)
  justificativaRegistroTardio String?
  dataRealizadaRetroativa    DateTime?
  comprovanteHospitalDestino String?

  // Anexos & Relacionamentos
  anexos                     AnexoSolicitacaoTFD[]
  alocacoes                  ViagemPassageiro[]

  createdAt                  DateTime              @default(now())
  updatedAt                  DateTime              @updatedAt

  @@map("solicitacoes_tfd")
}
```

### 2.2 Modelo `AnexoSolicitacaoTFD`

```prisma
model AnexoSolicitacaoTFD {
  id            String         @id @default(uuid())
  solicitacaoId String
  solicitacao   SolicitacaoTFD @relation(fields: [solicitacaoId], references: [id], onDelete: Cascade)
  tipo          TipoAnexoTFD   // ENCAMINHAMENTO, COMPROVANTE_CONSULTA, LAUDO_MEDICO, DOCUMENTO_IDENTIDADE, OUTRO
  nomeArquivo   String
  mimeType      String
  tamanhoBytes  Int
  url           String
  criadoEm      DateTime       @default(now())

  @@map("anexos_solicitacoes_tfd")
}

enum TipoAnexoTFD {
  ENCAMINHAMENTO
  COMPROVANTE_CONSULTA
  LAUDO_MEDICO
  DOCUMENTO_IDENTIDADE
  OUTRO
}
```

### 2.3 Modelo `ViagemTFD`

```prisma
model ViagemTFD {
  id                   String           @id @default(uuid())
  codigoViagem         String           @unique // Ex: VTFD-2026-0803-XXXX
  data                 DateTime
  horaSaida            String           // "06:00"
  horaPrevistaRetorno  String?          // "17:00"
  destino              String
  unidadeDestino       String?
  rotaResumo           String?
  
  veiculoId            String?
  veiculo              VeiculoTFD?      @relation(fields: [veiculoId], references: [id])
  motoristaId          String?
  motorista            MotoristaTFD?    @relation(fields: [motoristaId], references: [id])
  
  // Controle e Auditoria de KM pelo Gestor (Carro Baixo / Frota)
  kmInicialHodometro   Int?
  kmFinalHodometro     Int?
  kmEstimados          Int?
  kmGestorRegistradoPor String?        // UserId do Gestor
  kmGestorDataRegistro DateTime?
  justificativaKmGestor String?

  // Registro Tardio de Viagem
  isRegistroTardio     Boolean          @default(false)
  justificativaTardia  String?

  status               StatusViagemTFD  @default(AGENDADA) // AGENDADA, EM_ANDAMENTO, CONCLUIDA, CANCELADA
  passageiros          ViagemPassageiro[]
  observacoes          String?

  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  @@map("viagens_tfd")
}
```

---

## 3. Endpoints da API HTTP (`/v1/tfd/*`)

### 3.1 Criar Solicitação TFD
* **POST** `/v1/tfd/solicitacoes`
* **Body:**
```json
{
  "paciente": {
    "nome": "João da Silva",
    "cpf": "12345678901",
    "dataNascimento": "1985-05-20",
    "sexo": "M",
    "telefone": "(75) 99999-8888",
    "endereco": "Rua das Flores, 123",
    "bairro": "Centro",
    "municipio": "Serrinha",
    "uf": "BA"
  },
  "ubsId": "ubs-01",
  "especialidade": "CARDIOLOGIA",
  "destino": "Salvador",
  "motivo": "Consulta de retorno pré-operatório com cardiologista",
  "dataDesejada": "2026-08-15",
  "prioridade": "ROUTINA",
  "acompanhanteNecessario": false,
  "isRegistroTardio": false
}
```
* **Lógica do Server:**
  1. Valida campos obrigatórios (`400 Bad Request` se faltar algo).
  2. Caso seja `isRegistroTardio: true`, grava com status `REALIZADA`.
  3. Caso seja regular (`isRegistroTardio: false`), grava inicialmente como `PENDENTE`.

---

### 3.2 Enviar Anexo para Solicitação
* **POST** `/v1/tfd/solicitacoes/:id/anexos`
* **Content-Type:** `multipart/form-data`
* **Campos:** `file` (arquivo), `tipo` (`ENCAMINHAMENTO`, `COMPROVANTE_CONSULTA`, etc.).
* **Lógica do Server:**
  1. Salva o arquivo no storage (S3 ou local).
  2. Insere o registro em `anexos_solicitacoes_tfd`.
  3. **Roteamento de Prioridade:** Caso a solicitação passe a ter pelo menos 1 anexo válido, o backend sinaliza elegibilidade para **Alocação Automática Imediata** na viagem correspondente ao destino/data. Se permanecer sem anexo, a solicitação deve obrigatoriamente permanecer na **Fila de Espera da Regulação TFD**.

---

### 3.3 Lançamento / Auditoria de KM pelo Gestor (Carro Baixo)
* **POST** `/v1/tfd/viagens/:id/km-gestor`
* **Headers:** `Authorization: Bearer <Token_Gestor_TFD>`
* **Body:**
```json
{
  "kmInicialHodometro": 45000,
  "kmFinalHodometro": 45180,
  "justificativa": "Registro e auditoria de quilometragem realizada diretamente pela Gestão TFD (Prevenção de Irregularidades)."
}
```
* **Lógica do Server:**
  1. Grava `kmInicialHodometro`, `kmFinalHodometro` e recalcula a distância total percorrida.
  2. Registra o `kmGestorRegistradoPor` com a ID do usuário logado para trilha de auditoria.

---

### 3.4 Concluir Viagem com Trava Antifraude
* **POST** `/v1/tfd/viagens/:id/concluir`
* **Body:**
```json
{
  "veiculoId": "veic-carro-baixo-01",
  "motoristaId": "mot-01",
  "kmInicialHodometro": 45000,
  "kmFinalHodometro": 45180,
  "observacoes": "Viagem concluída sem intercorrências."
}
```
* **Validação do Server (Rígida):**
  * Se `veiculoId` for nulo → `HTTP 422 Unprocessable Entity` ("Veículo é obrigatório").
  * Se `motoristaId` for nulo → `HTTP 422 Unprocessable Entity` ("Motorista é obrigatório").
  * Se `kmInicialHodometro` ou `kmFinalHodometro` for nulo → `HTTP 422 Unprocessable Entity` ("Hodômetro inicial e final são obrigatórios").
  * Se validado com sucesso → Atualiza status da viagem para `CONCLUIDA` e altera o status das solicitações vinculadas para `REALIZADA`.

---

### 3.5 Alocar Passageiro Manualmente (Carro Baixo)
* **POST** `/v1/tfd/viagens/:id/alocar`
* **Body:**
```json
{
  "solicitacaoId": "solic-123",
  "numeroAssento": 3
}
```
* **Nota:** Se `numeroAssento` for omitido em viagens de carro baixo, o backend atribui automaticamente a próxima vaga livre (`count(passageiros) + 1`).

---

## 4. Resumo de Respostas HTTP de Erro Padrão

| Código HTTP | Motivo | Exemplo de Mensagem de Erro |
| :--- | :--- | :--- |
| `400 Bad Request` | Falta de campos obrigatórios no formulário. | `{"erro": "Falta de campos obrigatórios: CPF e telefone são requeridos."}` |
| `422 Unprocessable Entity` | Trava antifraude acionada na conclusão. | `{"erro": "Para finalizar a viagem de carro baixo, o Gestor DEVE fornecer Veículo, Motorista e Quilometragem (Hodômetro Inicial e Final)."}` |
| `403 Forbidden` | Perfil sem permissão de Gestor TFD. | `{"erro": "Permissão insuficiente para auditar quilometragem."}` |
