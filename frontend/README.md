# UNISISM Frontend

Frontend SvelteKit do UNISISM. O deploy de produção roda na Vercel no projeto
`unisism`; o backend roda separado em VPS.

## Desenvolvimento

```sh
cp .env.example .env
npm install
npm run dev
```

Por padrão, `.env.example` aponta para `http://localhost:3333/v1`.

## Produção na Vercel

Configure em **Vercel > Project `unisism` > Settings > Environment Variables**:

| Variavel            | Valor                                           |
| ------------------- | ----------------------------------------------- |
| `VITE_API_BASE_URL` | `https://api.seu-dominio/v1`                    |
| `VITE_API_KEY`      | vazio, ou o mesmo valor de `API_KEY` do backend |

`VITE_API_KEY` fica publico no bundle do navegador. Use apenas como camada leve
de protecao, junto de CORS e JWT no backend.

No backend da VPS, mantenha:

```sh
CORS_ORIGIN=https://unisism.vercel.app
CORS_ALLOW_VERCEL_PREVIEW=false
CORS_VERCEL_PROJECT=unisism
APP_RESET_SENHA_URL=https://unisism.vercel.app/redefinir
```

Para testar previews da Vercel, habilite temporariamente
`CORS_ALLOW_VERCEL_PREVIEW=true`. O backend aceita apenas previews cujo hostname
comece com `unisism-`.

## Validação local

```sh
npm run check
npm run lint
npm test
npm run test:browser
npm run test:coverage
npm run build
```

`npm run lint` é um gate incremental de ESLint baseado na baseline versionada
em `.eslint-suppressions.json`. Para diagnosticar a dívida completa use
`npm run lint:eslint:baseline`; para formatação, `npm run lint:format` ainda
aponta o baseline legado de Prettier.

## Building

```sh
npm run build
```

Preview local:

```sh
npm run preview
```
