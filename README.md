# Protocolo EAD — Backend (Vercel Functions)

Plataforma de treinamento EAD com login para 3 perfis (super admin, empresa
cliente e funcionário), trava de vagas por contrato, sistema anti-fraude
no player de vídeo e emissão de certificado em PDF.

Esta versão roda como **Vercel Functions** (serverless) — sem servidor
"sempre ligado", sem Express, e sem gravar arquivos em disco.

## O que tem aqui

```
protocolo-ead/
├── api/                          ← cada arquivo aqui é uma função serverless
│   │                                (12 ao todo — limite do plano Hobby da Vercel;
│   │                                 ver "Sobre o limite de 12 functions" abaixo)
│   ├── health.js                 ← GET /api/health
│   ├── auth/
│   │   └── login.js              ← POST /api/auth/login e /api/auth/login-funcionario
│   ├── admin/
│   │   ├── index.js              ← GET/POST /api/admin/empresas, /contratos, /suspeitos
│   │   └── treinamentos/
│   │       └── [[...id]].js      ← GET/POST /api/admin/treinamentos
│   │                                e /api/admin/treinamentos/:id/modulos
│   ├── empresa/
│   │   └── contratos/
│   │       ├── index.js                   ← GET /api/empresa/contratos
│   │       └── [id]/
│   │           └── funcionarios/
│   │               └── [[...fId]].js      ← GET/POST .../funcionarios
│   │                                          e DELETE .../funcionarios/:fId
│   ├── player/
│   │   ├── matricula.js          ← GET /api/player/matricula
│   │   ├── checkpoint.js         ← POST /api/player/checkpoint
│   │   ├── prova.js              ← GET (perguntas) e POST (respostas, gera certificado) /api/player/prova
│   │   ├── sessao/
│   │   │   └── index.js          ← POST /api/player/sessao/iniciar e /encerrar
│   │   └── certificado/
│   │       └── index.js          ← GET /api/player/certificado e .../certificado/pdf
│   └── validar/
│       └── [codigo].js           ← GET /api/validar/:codigo (público)
├── lib/                           ← código compartilhado entre as functions
│   ├── db.js                      ← conexão com o PostgreSQL (pool reaproveitado)
│   ├── auth.js                    ← validação de JWT e checagem de papel (role)
│   ├── http.js                    ← CORS, validação de método e de env vars
│   └── certificado.js             ← gera o PDF do certificado (puppeteer-core + @sparticuz/chromium)
├── scripts/
│   ├── migrate.js                 ← cria/atualiza as tabelas no banco
│   └── seed.js                    ← cria o primeiro usuário super admin
├── schema.sql                     ← estrutura do banco de dados
├── prototipo-plataforma-ead.html  ← protótipo visual (ainda não conectado à API)
├── vercel.json                    ← timeouts + rewrites das URLs consolidadas
├── .env.example                   ← modelo de variáveis de ambiente
└── package.json
```

## O que mudou da versão Express

| Antes (Express) | Agora (Vercel Functions) |
|---|---|
| Um servidor sempre ligado (`app.listen`) | Cada rota é uma função que só roda quando chamada |
| `puppeteer` (baixa Chromium completo, ~300MB) | `puppeteer-core` + `@sparticuz/chromium` (Chromium compacto, compatível com serverless) |
| PDF salvo em `uploads/certificados/*.pdf` | PDF gerado em memória e salvo em base64 no banco (coluna `certificados.arquivo_pdf_base64`) |
| `express.static` servia o PDF por URL de arquivo | Rota `GET /api/player/certificado/pdf?codigo=...` lê o base64 do banco e devolve o PDF |
| Middleware (`autenticar`, `exigirRole`) no meio da cadeia | Mesma lógica, mas chamada explicitamente no início de cada função (`exigirAuth`) |
| `npm run migrate` / `npm run seed` | **Sem mudança** — continuam rodando local/Codespace contra o mesmo banco |

A lógica de negócio (regras de vagas, anti-fraude, aprovação na prova, cálculo
de validade do certificado) é **exatamente a mesma**. Só a "casca" HTTP mudou.

## Rodando local (qualquer computador com Node instalado)

```bash
# 1. Entre na pasta do projeto
cd protocolo-ead

# 2. Copie o arquivo de variáveis de ambiente e preencha
cp .env.example .env
# abra o .env e cole sua DATABASE_URL, troque o JWT_SECRET, etc.

# 3. Instale as dependências
npm install

# 4. Crie as tabelas no banco (pode rodar de novo sem medo, é seguro)
npm run migrate

# 5. Crie seu usuário super admin (vai perguntar nome, e-mail, senha)
npm run seed

# 6. Instale a CLI da Vercel (só na primeira vez) e suba localmente
npm install -g vercel
vercel dev
```

Se aparecer `{"status":"ok", ...}` em `http://localhost:3000/api/health`,
está tudo funcionando.

> **Por que `vercel dev` e não `node src/server.js`?** Porque não existe mais
> `src/server.js` — cada arquivo em `api/` roda isolado, no formato que o
> Vercel espera. `vercel dev` simula esse ambiente localmente, então é a
> forma correta de testar antes do deploy.

---

## Passo a passo completo: GitHub + Neon + Vercel

### Etapa 1 — Colocar o código no GitHub

1. Acesse [github.com](https://github.com) e crie uma conta, se ainda não tiver.
2. Clique em **New repository** (botão verde).
3. Dê um nome (ex: `protocolo-ead`) → **Create repository**.
4. Na página seguinte, clique em **uploading an existing file**.
5. Extraia o ZIP no seu computador e arraste **todos os arquivos e pastas**
   (incluindo `api/`, `lib/`, `scripts/`, `schema.sql`, `package.json`,
   `vercel.json` etc.) para a janela do GitHub.
6. Clique em **Commit changes**.

> **Dica:** confira depois do upload se as pastas `api/` e `lib/` realmente
> aparecem no repositório, com todas as subpastas — o upload pelo navegador
> às vezes falha silenciosamente em arrastar pastas inteiras, especialmente
> as com nomes entre colchetes como `[id]`. Se faltar algo, repita o upload
> só da pasta que faltou, ou use o Codespace (Etapa 2) para subir via `git`.

### Etapa 2 — Abrir o terminal online (Codespaces) — opcional, mas recomendado

1. No repositório, clique no botão verde **`<> Code`**.
2. Aba **Codespaces** → **Create codespace on main**.
3. Aguarde cerca de 1 minuto. Vai abrir um VS Code completo no navegador,
   já com terminal.

Use o Codespace para rodar `npm run migrate`, `npm run seed`, e testar local
com `vercel dev` antes de cada deploy importante.

### Etapa 3 — Criar o banco de dados gratuito (Neon)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta (pode usar o Google).
2. **Create project** → dê um nome → **Create**.
3. Copie a **Connection string** (começa com `postgresql://...`). Guarde.

### Etapa 4 — Configurar e rodar a migration no Codespace

No terminal do Codespace (ou no seu computador):

```bash
npm install
cp .env.example .env
```

Abra o arquivo `.env` no explorador à esquerda e preencha:

```
DATABASE_URL=postgresql://...   ← cole a string do Neon aqui
JWT_SECRET=escolha-uma-frase-longa-e-aleatoria-aqui
NODE_ENV=development
APP_URL=http://localhost:3000
```

De volta ao terminal:

```bash
npm run migrate
npm run seed
```

Isso cria as tabelas e o seu usuário super admin **direto no banco Neon** —
não depende de onde o backend vai ficar hospedado depois.

### Etapa 5 — Deploy do backend na Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**.
2. Conecte o mesmo repositório do GitHub.
3. A Vercel detecta automaticamente que é um projeto Node com pasta `api/`
   — não precisa configurar build command nem output directory.
4. Antes de clicar em **Deploy**, abra a seção **Environment Variables** e
   adicione:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a mesma connection string do Neon |
   | `JWT_SECRET` | a mesma frase que você usou no `.env` local |
   | `NODE_ENV` | `production` |
   | `APP_URL` | (deixe vazio por enquanto) |

5. Clique em **Deploy**. Em ~1 minuto a Vercel te dá uma URL, algo como
   `https://protocolo-ead.vercel.app`.
6. Volte em **Settings → Environment Variables**, edite `APP_URL` e
   preencha com essa URL (sem barra no final): `https://protocolo-ead.vercel.app`.
7. Vá em **Deployments**, clique nos `...` do último deploy → **Redeploy**
   (precisa redeployar para a nova `APP_URL` valer — variáveis de ambiente só
   são lidas no momento do deploy).

Teste `https://SEU-DOMINIO.vercel.app/api/health` no navegador. Deve
responder `{"status":"ok", ...}`.

### Etapa 6 — Sobre rodar migration/seed em produção

Diferente do Railway, **não dá para abrir um shell interativo dentro de uma
Vercel Function** (elas só existem enquanto respondem uma requisição). Por
isso a migration e o seed continuam sendo feitos **de fora**, contra o banco
do Neon — exatamente como na Etapa 4. Se quiser criar um segundo super admin
depois, ou rodar a migration de novo após atualizar o `schema.sql`, basta
repetir `npm run migrate` / `npm run seed` localmente (ou no Codespace),
sempre com o mesmo `DATABASE_URL` de produção no `.env`.

### Etapa 7 — Sobre o tempo de geração do certificado

A geração do PDF (rota `POST /api/player/prova`, quando o funcionário é
aprovado) abre um Chromium dentro da função serverless. Isso é mais lento
que uma rota comum — geralmente 2 a 6 segundos. O arquivo `vercel.json` já
está configurado com `maxDuration: 30` para essa rota especificamente, o que
exige um projeto no **plano Pro** da Vercel para valer (o plano Hobby/grátis
tem um teto de 10s por função, mesmo se você configurar mais).

Se quiser ficar no plano gratuito, uma alternativa é desacoplar a geração do
PDF para um serviço externo de PDF-as-a-service (ex: Browserless, PDFShift)
chamado de dentro da function — me avise se quiser que eu monte essa
variante.

### Etapa 8 — Hospedar o frontend (Vercel, projeto separado ou mesmo projeto)

O `prototipo-plataforma-ead.html` pode ir na Vercel como site estático
**assim que estiver conectado à API real** (ele ainda usa dados de exemplo,
não fala com o backend). Pode ser:

- Um segundo projeto na Vercel apontando para o mesmo repositório
  (**Add New Project** novamente, mesmo repo); ou
- Movido para dentro de uma pasta `public/` neste mesmo projeto, já que a
  Vercel serve arquivos estáticos automaticamente lado a lado com `api/`.

---

## Sobre o limite de 12 functions do plano Hobby

A Vercel limita o plano gratuito (Hobby) a **12 Serverless Functions por
deploy**. Como a API original tinha 18 rotas (uma function por arquivo),
algumas foram agrupadas no mesmo arquivo físico para caber no limite — sem
mudar nenhuma URL pública. Um arquivo de `rewrites` no `vercel.json` cuida
de redirecionar internamente cada URL antiga para o arquivo certo:

| Arquivo físico | URLs que ele atende |
|---|---|
| `api/auth/login.js` | `/api/auth/login` e `/api/auth/login-funcionario` |
| `api/admin/index.js` | `/api/admin/empresas`, `/api/admin/contratos`, `/api/admin/suspeitos` |
| `api/admin/treinamentos/[[...id]].js` | `/api/admin/treinamentos`, `/api/admin/treinamentos/:id/modulos` e `/api/admin/treinamentos/:id/perguntas` |
| `api/empresa/contratos/[id]/funcionarios/[[...fId]].js` | `/api/empresa/contratos/:id/funcionarios` e `.../funcionarios/:fId` |
| `api/player/sessao/index.js` | `/api/player/sessao/iniciar` e `/api/player/sessao/encerrar` |
| `api/player/certificado/index.js` | `/api/player/certificado` e `/api/player/certificado/pdf` |

Se um dia migrar para o plano Pro, isso pode ser desfeito (voltar a um
arquivo por rota) por organização, mas não é obrigatório — funciona
perfeitamente assim também.

## O que ainda falta construir

- **Player de vídeo real**, integrado a um provedor como Mux, Cloudflare
  Stream ou Bunny (o campo `video_provider_id` no banco já está pronto pra
  isso).
- **Envio de e-mail** com a senha de acesso do funcionário e o certificado
  pronto (hoje fica só disponível por download via `/api/player/certificado/pdf`).

## Referência rápida das rotas da API

| Rota | Quem acessa | O que faz |
|---|---|---|
| `GET /api/health` | público | verifica se a função está no ar |
| `POST /api/auth/login` | admin / empresa | login por e-mail + senha |
| `POST /api/auth/login-funcionario` | funcionário | login por CPF + senha |
| `GET/POST /api/admin/treinamentos` | super admin | catálogo de treinamentos |
| `GET/POST /api/admin/treinamentos/:id/modulos` | super admin | vídeos/módulos do treinamento |
| `GET/POST /api/admin/treinamentos/:id/perguntas` | super admin | perguntas da prova final (gabarito) |
| `PUT/DELETE /api/admin/treinamentos/:id/perguntas/:perguntaId` | super admin | edita/exclui pergunta |
| `GET/POST /api/admin/empresas` | super admin | cadastro de empresas clientes |
| `GET/POST /api/admin/contratos` | super admin | venda de vagas (contratos) |
| `GET /api/admin/suspeitos` | super admin | matrículas com sinais de fraude |
| `GET /api/empresa/contratos` | empresa | contratos ativos da empresa |
| `GET/POST /api/empresa/contratos/:id/funcionarios` | empresa | cadastro de funcionários (trava de vagas) |
| `GET /api/empresa/estatisticas` | empresa | estatísticas simples do dashboard (funcionários ativos, cursos disponíveis, horas treinadas) |
| `DELETE /api/empresa/contratos/:id/funcionarios/:fId` | empresa | remove funcionário não iniciado |
| `GET /api/player/matricula` | funcionário | progresso do treinamento |
| `POST /api/player/sessao/iniciar` | funcionário | abre sessão de visualização |
| `POST /api/player/sessao/encerrar` | funcionário | fecha sessão, soma tempo assistido |
| `POST /api/player/checkpoint` | funcionário | registra evento anti-fraude |
| `GET /api/player/prova?matricula_id=...` | funcionário | perguntas da prova (sem gabarito) |
| `POST /api/player/prova` | funcionário | envia respostas; nota é calculada no servidor; gera certificado se aprovado |
| `GET /api/player/certificado` | funcionário | lista (array) dos certificados emitidos |
| `GET /api/player/certificado/pdf?codigo=...` | público* | devolve o PDF binário do certificado |
| `GET /api/player/certificado/pdf?id=...` | funcionário | devolve o PDF de um certificado próprio, por id |
| `GET /api/validar/:codigo` | público | valida autenticidade de um certificado |

\* É público porque é o link que vai no QR code do certificado físico/impresso,
mas só funciona com o código de validação certo — não há como "listar" os
certificados existentes por essa rota.
