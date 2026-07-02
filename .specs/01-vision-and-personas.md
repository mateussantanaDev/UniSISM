# 01 · Visão de produto e personas

## Problema

A regulação ambulatorial no SUS municipal sofre de problemas operacionais
crônicos:

1. **Fila opaca** — o paciente que recebe um encaminhamento de UBS não sabe se foi protocolado, em que estágio está, se foi aprovado ou se o agendamento existe.
2. **Documentos físicos** — encaminhamentos circulam em papel ou PDF avulso. Reconvocação por pendência exige o paciente voltar à UBS — muitos não voltam.
3. **Sem trilha de auditoria** — quando um Ministério Público ou TCM questiona um caso, a SMS não consegue reconstruir quem decidiu o quê, quando.
4. **TFD é o ralo orçamentário** — viagens com Van/ambulância/passagem rodoviária para tratar paciente fora do município tem fraude, overbook, abastecimento sem comprovante, pagamento de ajuda de custo sem rastreio.
5. **Múltiplos sistemas desconectados** — UBS usa A, regulação usa B, TFD usa planilha Excel, paciente não é avisado. Cada SMS reinventa.

## Proposta de valor

Uma **plataforma única** que cobre todo o ciclo:

1. **UBS** consolida encaminhamento com OCR/extração estruturada do PDF original do médico → não digita nada à mão.
2. **Regulação SMS** vê fila tipo "file-manager" hierárquica (UBS → Ano → Mês → Dia) — aprova, devolve com pendência ou rejeita.
3. **App do paciente** notifica em tempo real (push + email) cada mudança de status e disponibiliza o PDF oficial do SUS Federal quando volta.
4. **TFD** com fluxo end-to-end: solicitação → aprovação → programação de viagem (veículo + motorista + passageiros) → abastecimento → ajuda de custo → trilha imutável para o TJ.
5. **Audit imutável criptograficamente encadeado** (SHA-256 chain) para prestação de contas judicial.
6. **PEC** (Prontuário Eletrônico do Cidadão) com retenção 20 anos imutável (CFM 1.821/2007).
7. **LGPD** end-to-end — minimização em relatórios, retenção 5 anos do `relatorio_audit`, anti-enumeration em toda API.

## Princípios de design

| Princípio | Como se manifesta |
|---|---|
| **B2G brutalist** | UI densa, austera, sem decoração. Operador, não consumidor. |
| **Backend é fonte de verdade** | Frontend nunca decide regra de negócio. RBAC visível apenas como UX espelhando o que o backend já força. |
| **Contrato HTTP é sagrado** | `API.md` + `types.ts` + `api-client.ts` evoluem juntos. |
| **Multi-tenant estrito** | Tenant (`Prefeitura`) isolado por `scopeWhere` em toda query. 404 em vez de 403 para não vazar existência. |
| **Imutabilidade onde a lei exige** | Audit do PEC (CFM 20 anos), audit de relatório (LGPD 5 anos), audit do TFD (chain hash). Triggers SQL bloqueiam UPDATE/DELETE. |
| **Anti-corrupção contra ambiguidade clínica** | Códigos de erro são pt-BR claros e refletem regra real (`ENCAMINHAMENTO_NAO_EM_PENDENCIA`, `ASSENTO_OCUPADO`). |

## Personas

### P1 · Atendente UBS (`ATENDENTE_UBS`)

| Atributo | Valor |
|---|---|
| Quem é | Servidor da UBS responsável por receber e protocolar encaminhamentos de pacientes |
| Tela principal | `/ubs/encaminhamento` e `/ubs/novo-encaminhamento` |
| Pain | Re-digitar dados do PDF original; ter de reconvocar paciente por pendência |
| Como o produto resolve | OCR/extração automática (POST `/encaminhamentos/extract-pdf`); paciente é notificado via app |
| Métrica que importa | Quantidade de encaminhamentos por mês · taxa de pendência · tempo médio de resolução |

### P2 · Coordenador UBS (`COORDENADOR_UBS`)

| Atributo | Valor |
|---|---|
| Quem é | Coordena a UBS; vê todos os atendentes daquela unidade |
| Tela principal | `/ubs/dashboard` (visão UBS) + `/ubs/historico` (encaminhamentos da UBS) |
| Pain | Saber a produção de cada atendente; identificar gargalos |
| Como o produto resolve | Dashboard com métricas por atendente + filtros temporais |
| Métrica que importa | Produção da UBS · taxa de aprovação na primeira tentativa |

### P3 · Regulador SMS (`REGULADOR_SMS`)

| Atributo | Valor |
|---|---|
| Quem é | Servidor da Secretaria Municipal de Saúde que decide aprovação/pendência/rejeição |
| Tela principal | `/sms/solicitacoes` (file-manager hierárquico UBS → Ano → Mês → Dia) |
| Pain | Volume alto · perder visão de quem está esperando o quê |
| Como o produto resolve | Árvore navegável + filtros · fluxo de decisão em 3 cliques · resposta SUS sobe o PDF oficial direto pro paciente |
| Métrica que importa | Fila por idade · taxa de aprovação · backlog por UBS |

### P4 · Admin (`ADMIN`)

| Atributo | Valor |
|---|---|
| Quem é | Servidor responsável pela administração técnica do sistema dentro da prefeitura |
| Tela principal | `/sms/rede` (CRUD de UBSs, usuários) + `/sms/auditoria` (logs) |
| Pain | Provisionar acesso · revogar quem saiu · responder a auditoria |
| Como o produto resolve | CRUD de usuários e UBSs · auditoria full-text · reset de senha emergencial |
| Métrica que importa | Usuários ativos · sessões abertas · alertas de segurança |

### P5 · Gestor TFD (`GESTOR_TFD`)

| Atributo | Valor |
|---|---|
| Quem é | Servidor responsável pela frota e logística TFD |
| Tela principal | `/tfd/dashboard` + `/tfd/viagens` + `/tfd/saldo` |
| Pain | Orçamento estourando · viagem com vaga ociosa · TCM/TJ pedindo prestação de contas |
| Como o produto resolve | Saldo por veículo · alocação atômica de passageiros · trilha hash chain exportável para TJ |
| Métrica que importa | Custo por km · taxa de ocupação por viagem · saldo restante por veículo |

### P6 · Atendente TFD (`ATENDENTE_TFD`)

| Atributo | Valor |
|---|---|
| Quem é | Operador do terminal rodoviário que cadastra solicitações de viagem |
| Tela principal | `/tfd/solicitacoes` (subset) |
| Pain | Confusão sobre quem pode pedir e com que documentação |
| Como o produto resolve | Form único com upload do comprovante de encaminhamento aprovado |
| Métrica que importa | Solicitações cadastradas por dia |

### P7 · Motorista TFD (`MOTORISTA_TFD`)

| Atributo | Valor |
|---|---|
| Quem é | Motorista da frota — opera no app mobile |
| Tela principal | App Flutter (`UNISISM-motorista/`) |
| Pain | Receber escala em zap, anotar km em caderno, comprovante sumir |
| Como o produto resolve | Escala no app · chamada digital de passageiros · iniciar/concluir viagem com hodômetro · sync offline |
| Métrica que importa | Viagens realizadas · faltas registradas · CNH vigente |

### P8 · Paciente / Cidadão

| Atributo | Valor |
|---|---|
| Quem é | Pessoa atendida pela UBS que recebeu encaminhamento e/ou foi designada para TFD |
| Tela principal | App Flutter (`UNISISM-Paciente/`) |
| Pain | Não saber em que pé está o encaminhamento; perder telegrama de convocação |
| Como o produto resolve | Login com CPF · push em cada mudança de status · download do PDF oficial do SUS quando volta |
| Métrica que importa | Tempo até ver a primeira notificação · taxa de comparecimento (não-falta) |

### P9 · Desenvolvedor (`DESENVOLVEDOR`)

| Atributo | Valor |
|---|---|
| Quem é | Equipe técnica que mantém o produto e provisiona tenants |
| Tela principal | `/sms/rede` (com visão GLOBAL) · acesso ao banco, logs, tracing |
| Pain | Onboarding de novo tenant · debug de auditoria · suporte L3 |
| Como o produto resolve | API de admin completa (`/v1/admin/*`) · auditoria queryable · tracing distribuído |
| Métrica que importa | Uptime · p95 latency · número de tenants ativos |

## Casos de uso macro

```
1. Paciente vai à UBS
   ↓
2. Médico emite PDF de solicitação
   ↓
3. Atendente UBS faz OCR/extract no PDF → form pré-preenchido → consolida
   ↓
4. Sistema cria PacienteConta (se não existir) com senha = CPF
   → Paciente recebe push: "Seu encaminhamento foi protocolado"
   ↓
5. Encaminhamento entra na fila da Regulação SMS
   ↓
6. Regulador decide: aprovar / pendência / rejeitar
   ├─ Aprovado:    push para paciente: "Aprovado!"
   ├─ Pendência:   push para paciente: "Precisa de mais um documento" + email para UBS
   └─ Rejeitado:   push para paciente: "Rejeitado — procure a UBS"
   ↓
7. Quando o SUS Federal devolve agenda:
   Regulador anexa PDF oficial → paciente baixa pelo app
   ↓
8. Se o caso for TFD:
   ├─ Atendente UBS ou Terminal cria SolicitacaoTFD com comprovante
   ├─ Gestor TFD aprova e aloca em ViagemFrota com Veiculo + Motorista
   ├─ Motorista vê escala no app, registra km inicial, marca presença
   ├─ Sistema paga ajuda de custo (PIX) e libera abastecimento
   ├─ Motorista conclui viagem com km final
   └─ Cadeia hash do audit registra tudo — exportável para TCM/TJ
```
