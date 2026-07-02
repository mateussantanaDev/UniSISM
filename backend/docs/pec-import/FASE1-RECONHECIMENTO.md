# PEC e-SUS APS · Águas Belas · Fase 1 — Reconhecimento

**Data**: 2026-06-01 · **Versão PEC**: 5.4.37
**Operador**: Mateus Vieira via UNISISM ETL bot
**Conta usada**: Charllyanne Rodrigues Tenorio (Enfermeira · CBO 223505)
**Perfil escolhido**: Gestor municipal · ÁGUAS BELAS

---

## 1. Sistema identificado

- **Produto**: e-SUS Atenção Primária — Prontuário Eletrônico do Cidadão (PEC)
- **Fornecedor**: Ministério da Saúde
- **Hospedagem**: esuscloud.com.br (multi-tenant SaaS terceirizado)
- **URL**: https://aguasbelas.esuscloud.com.br/
- **Versão**: 5.4.37
- **Arquitetura interna**: Vaadin (SPA) + JSF/PrimeFaces clássico (em iframe `/esus/#/pec/user/...`)

## 2. Política de segurança observada

- **Anti-brute force**: bloqueio após 5 tentativas de login falhas
- **Cookies LGPD-compliant** (banner GovBR padrão)
- **Sessão com timeout** (não testado tempo exato)

## 3. Rede de saúde mapeada (14 unidades)

Extraído da tela de seleção de perfil:

| # | Nome | INE (Identificador Nacional de Equipe) |
|---|---|---|
| 1 | PSF Jose Wellington Alves Rodrigues | 0000134813 |
| 2 | Secretaria de Saude de Aguas Belas | — |
| 3 | UBS Abel Dias da Silva | 0002459485 |
| 4 | UBS Ayrton Diogenes | 0000134848 |
| 5 | UBS Garanhuzinho | 0002459477 |
| 6 | UBS Jovelina Maria dos Santos | 0002459493 |
| 7 | UBS Paulo Maranhão | 0000134910 |
| 8 | USF Campo Grande | 0000134872 |
| 9 | USF Zilda Arns | 0000134910 |
| 10 | USF Alan Roberto | 0001592084 |
| 11 | USF Dr Clecio Xavier | 0000134899 |
| 12 | USF Nahor Gueiros (Lagoa do Barro) | 0000134848 |
| 13 | USF Zumbi | 0000134856 |
| 14 | USF de Curral Novo | 0000134821 |

⚠️ INEs duplicados em 4/12 e 7/9 sugerem equipes compartilhadas entre unidades.

## 4. Catálogo de relatórios (perfil Gestor municipal)

### 4.1 Gerenciais (5) — agregados não-nominais
- `/relatorios/gerenciais/absenteismo`
- `/relatorios/gerenciais/atendimentos`
- `/relatorios/gerenciais/cuidado-compartilhado`
- `/relatorios/gerenciais/vacinacao`
- `/relatorios/gerenciais/exames`

### 4.2 Consolidados (3) — agregados (não-nominais)
- `/relatorios/consolidados/cadastro-domiciliar`
- `/relatorios/consolidados/cadastro-individual`
- `/relatorios/consolidados/situacao-territorio`

### 4.3 Produção (12) — **com Exportar CSV (potencialmente nominais)** ⭐
- `/relatorios/producao/atendimento-domiciliar`
- `/relatorios/producao/atendimento-individual`
- `/relatorios/producao/atendimento-odontologico`
- `/relatorios/producao/atividade-coletiva`
- `/relatorios/producao/avaliacao-elegibilidade-admissao`
- `/relatorios/producao/marcadores-consumo-alimentar`
- `/relatorios/producao/procedimentos-consolidados`
- `/relatorios/producao/procedimentos-individualizados`
- `/relatorios/producao/resumo-producao`
- `/relatorios/producao/sindrome-neurologica-zika`
- `/relatorios/producao/vacinacao`
- `/relatorios/producao/visita-domiciliar`

### 4.4 Outros módulos
- `/importar-bolsa-familia` — entrada do Bolsa Família
- `/transmissao` — sincronização com Centralizador SISAB (entrada de dados das UBSs)

## 5. Mecânica de exportação CSV (confirmada)

Relatórios de produção têm **botão "Exportar CSV"** no rodapé. Filtros disponíveis no `Atendimento individual`:

- Modelo: **Analítico** ou Série Histórica
- Período: livre (mm/aaaa até mm/aaaa)
- Unidade de saúde (combobox multi)
- Equipe (combobox multi)
- Profissional (combobox)
- Categoria profissional (combobox)
- Grupos de informação (checkbox múltiplo — controla colunas do CSV):
  - Dados gerais, Turno, Sexo, Faixa etária
  - Local/Tipo de atendimento, Atenção domiciliar, Racionalidade
  - Aleitamento, NASF, eMulti, Conduta/Desfecho, Encaminhamento
  - Problemas/Condições (CIAP2, CID10, Doenças transmissíveis, Rastreamento)
  - Exames solicitados/avaliados, Triagem neonatal, SIGTAP, OCI
- Filtros personalizados (KV pairs)

### Fila assíncrona
Cada export entra em fila com status **"Pronto"** quando concluído (visível em "Relatórios em processamento/processados (7 dias)"). A operadora já tem 5 relatórios prontos do dia 29/05/2026.

## 6. Limitações observadas

- ⚠️ **Gestor municipal NÃO tem acesso direto ao cadastro do cidadão** (ficha individual com prontuário completo). Pra esses dados precisaria entrar como profissional de cada UBS.
- ⚠️ **Histórico clínico longitudinal** (evoluções, prescrições) só via perfil de profissional.
- ✅ Mas relatórios **Atendimento Individual** + **Cadastro Individual** podem incluir dados nominais via Exportar CSV (a confirmar).

## 7. Próxima fase (Fase 2 — proposta)

Estratégia **CSV-export em massa**:

1. Definir período: 2024-01-01 até hoje (2+ anos cobertura, evita estourar memória do PEC)
2. Pra cada relatório de produção (12 disponíveis):
   - Marcar TODOS os grupos de informação
   - TODAS as UBSs / TODAS equipes
   - Filtro vazio em profissional/categoria
3. Disparar Exportar CSV → entra na fila
4. Aguardar processamento (5-10 min por relatório)
5. Baixar CSV (vai pra `data/pec-csv/<relatorio>.csv`)
6. Parsing → mapeamento → import no UNISISM (com audit IMPORT_PEC)

Pra **dados nominais individuais** (paciente por paciente):
- Avaliar se "Cadastro individual" tem CSV com nome+CPF+endereco+data nasc
- Se SIM → suficiente
- Se NÃO → precisa entrar como profissional de UBS (14 logins separados, mais frágil)

## 8. Estado da sessão

✓ Logout efetuado (`/logoutSuccess`)
✓ Navegador fechado
✓ Credenciais permanecem em `backend/.env.pec` (gitignored)
