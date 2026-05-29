# UNISISM · UBS — Pacote de integração para o frontend

Este diretório contém **tudo** que os frontends (UBS/SMS web + app do paciente mobile) precisam para consumir a API.

## Mapa da pasta

```
backend/docs/
├── README.md              ← VOCÊ ESTÁ AQUI — guia de setup + receitas + troubleshooting
├── API.md                 ← Referência canônica de TODAS as rotas, request/response, erros
├── RELATORIOS.md          ← Spec LGPD-first do módulo de Relatórios (arquitetura, tipos, pipeline)
├── CHANGELOG.md           ← Delta versão-a-versão (0.1.0 → 0.5.0)
├── types.ts               ← [TypeScript] Interfaces das Faces 1 + 2 + Admin
├── api-client.ts          ← [TypeScript] Cliente HTTP tipado com `fetch`
└── flutter/               ← Kit separado do app do paciente
    ├── README.md          ← Guia Flutter: pubspec, URLs emulator, exemplos
    ├── unisism_types.dart ← [Dart] Tipos espelhados da Face 3
    └── unisism_api.dart   ← [Dart] Cliente com `dio` + `flutter_secure_storage`
```

## Qual arquivo usar?

| Você está fazendo... | Use |
|---|---|
| **Webapp UBS** (atendente consolidando encaminhamentos) | `types.ts` + `api-client.ts` (`api.encaminhamentos.*`, `api.pacientes.*`) |
| **Webapp SMS** (regulador decidindo casos) | `types.ts` + `api-client.ts` (`api.encaminhamentos.aprovar()`, `.arvore()` etc.) |
| **Webapp Admin** (gerenciar prefeituras/UBSs/usuários) | `types.ts` + `api-client.ts` (`api.admin.*`) |
| **App mobile do paciente** (Flutter) | `flutter/unisism_types.dart` + `flutter/unisism_api.dart` + `flutter/README.md` |
| **Entender uma rota / erro específico** | `API.md` |
| **Saber o que mudou desde a última vez** | `CHANGELOG.md` |

---

## 🚀 Setup em 3 passos

### 1. Copiar os arquivos para o frontend

```bash
mkdir -p frontend/src/lib/api
cp backend/docs/types.ts      frontend/src/lib/api/types.ts
cp backend/docs/api-client.ts frontend/src/lib/api/client.ts
```

### 2. Configurar variável de ambiente

`frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:3333/v1
```

### 3. Instanciar o cliente uma vez (singleton)

`frontend/src/lib/api/index.ts`:

```ts
import { ApiClient } from './client';

export const api = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3333/v1',
);
```

Pronto. A partir daqui, basta `import { api } from '$lib/api'`.

---

## 🐳 Subir o backend (dev local)

Três containers obrigatórios + backend Node. Com `docker compose` V2:

```bash
cd backend
cp .env.example .env           # ajuste se quiser
docker compose up -d postgres redis minio
# (opcional, demora ~5min no 1º start) docker compose up -d clamav

npm install
npm run prisma:generate
npm run prisma:migrate -- --name init    # ou: npx prisma db push
npm run db:seed
npm run dev
```

Sem compose V2? `docker run` equivalente:

```bash
docker run -d --name unisism-postgres -e POSTGRES_USER=unisism -e POSTGRES_PASSWORD=unisism \
  -e POSTGRES_DB=unisism_ubs -p 5432:5432 -v unisism-pgdata:/var/lib/postgresql/data postgres:16-alpine

docker run -d --name unisism-redis -p 6379:6379 redis:7-alpine

docker run -d --name unisism-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=unisism -e MINIO_ROOT_PASSWORD=unisism12345 \
  -v unisism-minio-data:/data minio/minio:latest \
  server /data --console-address :9001
```

Endpoints expostos:

| Serviço | URL |
|---|---|
| API UNISISM | `http://localhost:3333/v1` |
| Prometheus metrics (interno) | `http://localhost:3333/metrics` |
| MinIO Console | `http://localhost:9001` (user: `unisism` / senha: `unisism12345`) |
| Prisma Studio (UI do banco) | `npm run prisma:studio` → `http://localhost:5555` |

---

## 🧰 Toggles de infra (via `.env`)

| Variável | Default | Efeito quando setada |
|---|---|---|
| `REDIS_URL` | vazio | Ativa cache na árvore (TTL 60s) |
| `STORAGE_PROVIDER` | `disk` | `s3` usa MinIO/AWS S3 |
| `CLAMAV_HOST` | vazio | Ativa scan real (sem ela, marca todo anexo como `LIMPO`) |
| `METRICS_ENABLED` | `true` | Desliga `/metrics` se `false` |
| `OUTBOX_ENABLED` | `true` | Desliga publisher de eventos |

**Para dev rápido**: deixe tudo default + `REDIS_URL=redis://localhost:6379`. Pronto.

---

## 📚 Receitas comuns

### Login (página `/login`)

```ts
import { api, ApiError } from '$lib/api';
import { goto } from '$app/navigation';

async function entrar(login: string, senha: string) {
  try {
    await api.auth.login({ login, senha });
    const me = await api.auth.me();
    goto(me.escopo === 'GLOBAL' || me.escopo === 'PREFEITURA' ? '/admin' : '/ubs/dashboard');
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'CREDENCIAIS_INVALIDAS') return 'Login ou senha inválidos';
      if (e.code === 'USUARIO_BLOQUEADO') return 'Usuário bloqueado por excesso de tentativas';
      if (e.code === 'SENHA_EXPIRADA') return goto('/login/redefinir');
    }
    throw e;
  }
}
```

### Esqueci minha senha — fluxo de 3 passos

```ts
// 1. solicitar código
await api.auth.forgotPassword({ login: 'SMS-047291' });

// 2. validar código (após usuário digitar os 6 dígitos)
const r = await api.auth.verifyCode({ login: 'SMS-047291', codigo: '123456' });
if (!r.valido) throw new Error('Código inválido');

// 3. trocar a senha
await api.auth.resetPassword({ resetToken: r.resetToken!, novaSenha: 'novaSenha123' });
```

### Dashboard

```ts
const [me, metricas] = await Promise.all([
  api.auth.me(),
  api.dashboard.metrics(),
]);
```

### Novo encaminhamento — fluxo completo

```ts
// 1. extrair PDF (não persiste)
const extracao = await api.encaminhamentos.extractPdf(pdfFile);
console.log(extracao.confiancaExtracao); // 0..1

// 2. atendente revisa/edita os campos extraídos na UI...

// 3. consolidar
const { id, protocolo } = await api.encaminhamentos.create({
  paciente: extracao.paciente,
  solicitacao: extracao.solicitacao,
  solicitacaoPdf: pdfFile,
  anexos: [
    { arquivo: rgFile,    nome: 'rg.pdf',    tipo: 'RG' },
    { arquivo: examFile,  nome: 'ecg.pdf',   tipo: 'EXAME' },
  ],
});
goto(`/ubs/encaminhamento/${id}`);
```

### Histórico com filtro

```ts
const aguardando = await api.encaminhamentos.list({ status: 'AGUARDANDO_REGULACAO' });
const doMes = await api.encaminhamentos.list({
  desde: '2026-04-01',
  ate: '2026-04-30',
  limit: 200,
});
```

### Resolver pendência

```ts
import type { AnexoUpload } from '$lib/api/client';

const anexos: AnexoUpload[] = arquivos.map((f) => ({
  arquivo: f,
  nome: f.name,
  tipo: 'EXAME',
}));

const atualizado = await api.encaminhamentos.resolverPendencia(
  encId,
  'Anexando ECG e exames laboratoriais conforme solicitado',
  anexos,
);
```

### PEC — listar e ver paciente

```ts
const pacientes = await api.pacientes.list({ q: 'Maria', filtro: 'COM_CRONICAS' });
const paciente = await api.pacientes.byId(pacientes[0].id);

paciente.condicoesCronicas.forEach(c => console.log(c.cid10, c.descricao));
```

### Relatórios (assíncrono com polling)

```ts
const r = await api.relatorios.createAndWait(
  {
    tipo: 'PRODUCAO_INDIVIDUAL',
    dataInicial: '2026-04-01',
    dataFinal: '2026-04-30',
    formato: 'PDF',
  },
  { intervalMs: 2000, timeoutMs: 60000 },
);

const { blob, filename } = await api.relatorios.download(r.id);
const url = URL.createObjectURL(blob);
// ...exibir/baixar
```

### Admin — DEV criando uma prefeitura + UBS + usuários

```ts
// requer login como DEV-001
await api.auth.login({ login: 'DEV-001', senha: '12345678' });

const pref = await api.admin.createPrefeitura({
  nome: 'Prefeitura Municipal de Salvador',
  municipio: 'Salvador',
  uf: 'PE',
  cnpj: '13.927.801/0001-49',
});

const ubs = await api.admin.createUbs({
  nome: 'UBS BARRA',
  municipio: 'Salvador',
  uf: 'PE',
  prefeituraId: pref.id,
  cnes: '9999999',
});

await api.admin.createUsuario({
  nome: 'JOSE ADMIN SALVADOR',
  email: 'jose@aguasbelas.pe.gov.br',
  matricula: 'ADM-002',
  cpf: '111.111.111-11',
  senha: '12345678',
  role: 'ADMIN',
  prefeituraId: pref.id,
});

await api.admin.createUsuario({
  nome: 'PAULA ATENDENTE BARRA',
  email: 'paula@aguasbelas.pe.gov.br',
  matricula: 'SMS-099999',
  cpf: '222.222.222-22',
  senha: '12345678',
  role: 'ATENDENTE_UBS',
  ubsId: ubs.id,
});
```

### Admin — editar / desativar / resetar senha de usuário

```ts
// Editar dados (nome, email, telefone, vínculo UBS/prefeitura)
await api.admin.updateUsuario(userId, {
  nome: 'NOVO NOME',
  telefone: '(75) 99999-0000',
});

// Desativar (revoga sessões automaticamente)
await api.admin.setAtivoUsuario(userId, false);

// Admin redefine senha (usuário é forçado a trocar no próximo login)
await api.admin.resetarSenhaUsuario(userId, 'senhaProvisoria123');

// Soft delete (mantém no DB pra LGPD/audit)
await api.admin.deleteUsuario(userId);
```

### Atendente — editar encaminhamento antes da Regulação

```ts
// Só funciona em AGUARDANDO_REGULACAO (senão 409)
await api.encaminhamentos.update(encId, {
  justificativaClinica: 'Texto revisado com mais contexto...',
  prioridade: 'URGENTE',
});
// Gera evento "EDITADO" automático na timeline
```

### App do paciente (Flutter) — é outro kit

Não use `types.ts` / `api-client.ts` pra isso. Use o kit Dart:

```bash
cp backend/docs/flutter/unisism_types.dart  meu_app/lib/api/
cp backend/docs/flutter/unisism_api.dart    meu_app/lib/api/
```

Ver detalhes em [`flutter/README.md`](flutter/README.md) — inclui URLs de emulator/device, `pubspec.yaml`, exemplos de tela e integração futura com FCM.

### Admin — listar usuários da minha prefeitura

```ts
// como ADMIN: vê só sua prefeitura automaticamente
const usuarios = await api.admin.listUsuarios({ q: 'Mateus' });
const apenasAtendentes = await api.admin.listUsuarios({ role: 'ATENDENTE_UBS' });
```

---

## 🛡️ Esconder UI por escopo / role

O endpoint `GET /auth/me` retorna `role` e `escopo`. Use direto:

```svelte
<script lang="ts">
  import { api } from '$lib/api';
  import type { MeResponse } from '$lib/api/types';

  let me: MeResponse;
  onMount(async () => { me = await api.auth.me(); });

  const podeCriarPrefeitura = $derived(me?.role === 'DESENVOLVEDOR');
  const podeCriarUbs        = $derived(me?.role === 'DESENVOLVEDOR' || me?.role === 'ADMIN');
  const podeCriarUsuario    = $derived(me?.role === 'DESENVOLVEDOR' || me?.role === 'ADMIN');
  const podeConsolidarEnc   = $derived(me?.role === 'ATENDENTE_UBS' || me?.role === 'COORDENADOR_UBS');
  const ehAdminOuDev        = $derived(me?.escopo === 'GLOBAL' || me?.escopo === 'PREFEITURA');
</script>

{#if podeCriarUsuario}
  <a href="/admin/usuarios/novo">+ Novo usuário</a>
{/if}
```

> ⚠️ **A UI esconder não é segurança.** O backend bloqueia tudo que não estiver no escopo (`403 PERMISSAO_INSUFICIENTE` ou `403 FORA_DO_ESCOPO`). Esconder no frontend é só UX.

---

## 🔁 Tratamento global de erros

```ts
import { ApiError } from '$lib/api/client';
import { goto } from '$app/navigation';

export async function comTratamento<T>(p: Promise<T>): Promise<T> {
  try { return await p; }
  catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'TOKEN_EXPIRADO' || e.code === 'TOKEN_AUSENTE') {
        goto('/login');
      }
      if (e.code === 'PERMISSAO_INSUFICIENTE' || e.code === 'FORA_DO_ESCOPO') {
        // toast: "Você não tem permissão para essa ação"
      }
    }
    throw e;
  }
}

// uso
const enc = await comTratamento(api.encaminhamentos.byId(id));
```

---

## 🧪 Usuários do seed (dev local)

Senha padrão: **`12345678`**

### Usuários administrativos/clínicos (Faces 1 e 2)

| Matrícula | Role | Escopo | Use para testar |
|---|---|---|---|
| `DEV-001` | `DESENVOLVEDOR` | GLOBAL | criar prefeituras / UBSs / qualquer usuário |
| `ADM-001` | `ADMIN` | Prefeitura Águas Belas | criar UBSs e usuários só dessa prefeitura |
| `SMS-099101` | `REGULADOR_SMS` | Prefeitura Feira (Face 2) | aprovar / pendenciar / rejeitar encaminhamentos |
| `SMS-047291` | `ATENDENTE_UBS` | UBS CENTRAL | fluxo de encaminhamento |

Login alternativo por email:
- `dev@unisism.com.br`
- `ana.admin@aguasbelas.pe.gov.br`
- `regulador@aguasbelas.pe.gov.br`
- `mateus.santana@saude.aguasbelas.pe.gov.br`

### Conta do paciente (Face 3 · app mobile)

| CPF | Senha | Nome |
|---|---|---|
| `123.456.789-00` (ou `12345678900`) | `12345678` | MARIA APARECIDA DA SILVA SANTOS |

Já existem encaminhamentos criados com esse CPF — ao logar no app, a timeline aparece preenchida.

Encaminhamento de teste em pendência: **`UBS-2026-100137`** (UBS CENTRAL).

---

## 📋 Mapa rápido (rota → método do cliente)

| Método HTTP | Rota | Cliente |
|---|---|---|
| POST | `/auth/login` | `api.auth.login(req)` |
| POST | `/auth/logout` | `api.auth.logout(refreshToken?)` |
| POST | `/auth/forgot-password` | `api.auth.forgotPassword(req)` |
| POST | `/auth/verify-code` | `api.auth.verifyCode(req)` |
| POST | `/auth/reset-password` | `api.auth.resetPassword(req)` |
| GET | `/auth/me` | `api.auth.me()` |
| GET | `/me/profile` | `api.perfil.get()` |
| POST | `/me/password` | `api.perfil.changePassword(req)` |
| POST | `/me/sessions/revoke-others` | `api.perfil.revokeOtherSessions()` |
| GET | `/dashboard/metrics` | `api.dashboard.metrics()` |
| POST | `/encaminhamentos/extract-pdf` | `api.encaminhamentos.extractPdf(file)` |
| POST | `/encaminhamentos` | `api.encaminhamentos.create(input)` |
| GET | `/encaminhamentos` | `api.encaminhamentos.list(query?)` |
| GET | `/encaminhamentos/:id` | `api.encaminhamentos.byId(id)` |
| POST | `/encaminhamentos/:id/resolve-pendencia` | `api.encaminhamentos.resolverPendencia(id, nota, anexos?)` |
| PATCH | `/encaminhamentos/:id` | `api.encaminhamentos.update(id, req)` |
| POST | `/encaminhamentos/:id/aprovar` | `api.encaminhamentos.aprovar(id, req?)` (Face 2) |
| POST | `/encaminhamentos/:id/registrar-pendencia` | `api.encaminhamentos.registrarPendencia(id, req)` (Face 2) |
| POST | `/encaminhamentos/:id/rejeitar` | `api.encaminhamentos.rejeitar(id, req)` (Face 2) |
| POST | `/encaminhamentos/:id/resposta-sus` | `api.encaminhamentos.registrarRespostaSus(id, pdf, observacao)` (Face 2) |
| GET | `/encaminhamentos/arvore` | `api.encaminhamentos.arvore(query?)` (Face 2 · file-manager) |
| GET | `/pacientes` | `api.pacientes.list(query?)` |
| GET | `/pacientes/:id` | `api.pacientes.byId(id)` |
| GET | `/relatorios` | `api.relatorios.list()` |
| POST | `/relatorios` | `api.relatorios.create(req)` |
| GET | `/relatorios/:id/download` | `api.relatorios.download(id)` |
| POST | `/admin/prefeituras` | `api.admin.createPrefeitura(req)` |
| GET | `/admin/prefeituras` | `api.admin.listPrefeituras()` |
| POST | `/admin/ubs` | `api.admin.createUbs(req)` |
| GET | `/admin/ubs` | `api.admin.listUbs(query?)` |
| POST | `/admin/usuarios` | `api.admin.createUsuario(req)` |
| GET | `/admin/usuarios` | `api.admin.listUsuarios(query?)` |
| PATCH | `/admin/usuarios/:id` | `api.admin.updateUsuario(id, req)` |
| DELETE | `/admin/usuarios/:id` | `api.admin.deleteUsuario(id)` |
| POST | `/admin/usuarios/:id/ativo` | `api.admin.setAtivoUsuario(id, ativo)` |
| POST | `/admin/usuarios/:id/reset-senha` | `api.admin.resetarSenhaUsuario(id, senha)` |
| — | — | — |
| POST | `/paciente-app/auth/login` | `api.pacienteApp.login({cpf, senha})` (Face 3) |
| POST | `/paciente-app/auth/ativar-conta` | `api.pacienteApp.ativarConta(req)` |
| POST | `/paciente-app/auth/logout` | `api.pacienteApp.logout()` |
| GET | `/paciente-app/me` | `api.pacienteApp.me()` |
| GET | `/paciente-app/meus-encaminhamentos` | `api.pacienteApp.meusEncaminhamentos()` |
| GET | `/paciente-app/notificacoes` | `api.pacienteApp.listarNotificacoes({apenasNaoLidas?})` |
| GET | `/paciente-app/notificacoes/count` | `api.pacienteApp.contadorNaoLidas()` |
| POST | `/paciente-app/notificacoes/:id/lida` | `api.pacienteApp.marcarLida(id)` |
| POST | `/paciente-app/notificacoes/marcar-todas-lidas` | `api.pacienteApp.marcarTodasLidas()` |
| GET | `/paciente-app/anexos/:id/download` | `api.pacienteApp.downloadAnexo(id)` |
| GET | `/health` | `fetch('/v1/health')` (não precisa de token) |

---

## 🩺 Troubleshooting comum

| Sintoma | Causa provável | Fix |
|---|---|---|
| `Can't reach database server at localhost:5432` | Postgres parado | `docker start unisism-postgres` |
| `redis error (operando sem cache)` nos logs | Redis parado (backend continua, só sem cache) | `docker start unisism-redis` ou ignore se não precisa de cache |
| `TOKEN_EXPIRADO` logo após login | Relógio do sistema desalinhado | `sudo sntp -sS time.apple.com` (macOS) |
| Botão de download do anexo desabilitado | `scanStatus === 'PENDENTE'` | Aguarde alguns segundos. Em dev sem ClamAV, isso é instantâneo |
| `403 PERMISSAO_INSUFICIENTE` em `/admin/usuarios` | Role do JWT não tem permissão | Login com `DEV-001` ou `ADM-001` |
| `404 ENCAMINHAMENTO_NAO_ENCONTRADO` para ID que existe | Isolamento por prefeitura — você está autenticado como REG/ADMIN de outra prefeitura | Verificar `me.prefeitura` via `GET /auth/me` |
| `SENHA_EXPIRADA` no login | Senha com mais de 180 dias | Fluxo forgot → verify → reset |

## 📖 Próximos passos

- Para entender **regras de negócio** e **erros** de cada rota → [`API.md`](API.md).
- Para saber **o que mudou** nas últimas versões → [`CHANGELOG.md`](CHANGELOG.md).
- Se algum endpoint mudar no backend, este pacote (`types.ts` + `api-client.ts` + `API.md` + `CHANGELOG.md`) é atualizado junto.
