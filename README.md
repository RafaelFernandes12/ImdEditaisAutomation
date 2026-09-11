# IMD Editais Automation

Bot de WhatsApp que monitora o [portal de editais do IMD/UFRN](https://www.metropoledigital.ufrn.br/portal/editais), resume cada vaga com IA e avisa os alunos cadastrados assim que sai algo novo — tudo pelo WhatsApp.

O problema que ele resolve: os editais do IMD saem sem aviso, cada um é um PDF com várias vagas dentro, e o processo evolui com novos anexos ao longo do tempo (currículo, entrevista, resultado). Quem não fica atualizando o portal manualmente perde prazo.

## O que ele faz

1. **Descobre editais novos.** Faz scraping do portal com `fetch` + Cheerio, identificando editais ainda não vistos na seção "Em andamento".
2. **Lê os PDFs.** Extrai o texto de cada anexo com `pdf-parse`.
3. **Resume cada vaga com IA.** Um LLM (OpenAI, endpoint configurável) transforma o PDF em um resumo estruturado, pronto para WhatsApp — remuneração, carga horária, duração, palavras-chave e elegibilidade.
4. **Notifica os alunos cadastrados** por WhatsApp assim que o edital sai, e evita reenviar o mesmo edital duas vezes.
5. **Envia PDFs que citam o aluno pelo nome** (ex: listas de homologados, resultado) assim que aparecem.
6. **Encerra o acompanhamento** quando o edital some da seção "Em andamento" do portal.

Essas quatro etapas rodam sozinhas via `@Cron` a cada 6 horas, e também podem ser disparadas manualmente por HTTP (ver [Rotas](#rotas)).

### Exemplo de mensagem enviada

```
*1. PROCESSO SELETIVO SIMPLIFICADO*
🗓️ Inscrições até: 11/09/2026
🔗 https://www.metropoledigital.ufrn.br/portal/visualizar/881
   📎 Edital de seleção: https://tinyurl.com/28okks7w
*Vaga:* DESENVOLVEDOR(A) FRONTEND
*Qtd vagas:* 1
*Remuneração:* R$ 2.400,00 (20h semanais / A definir / Presencial/Híbrido/Remoto)
*Palavras-chaves:* HTML, CSS, JavaScript, APIs REST, Git
*Duração:* Até 8 meses
*Elegibilidade:* Graduação em andamento na UFRN em TI, Ciência da Computação,
Engenharia de Software ou curso afim; organização, responsabilidade, proatividade.
```

### Cadastro e comandos no WhatsApp

O cadastro acontece dentro da própria conversa: o aluno manda `!login`, informa o nome completo e já é vinculado automaticamente a todos os editais em andamento no momento.

| Comando | O que faz |
|---|---|
| `!login` | Inicia o cadastro (pede apenas o nome) e assina os editais ativos |
| `!editais andamento` | Lista os editais em andamento |
| `!desativar` | Para de receber notificações |
| `!reativar` | Volta a receber notificações |
| `!ping` | Responde `pong`, útil para checar se o bot está no ar |

## Arquitetura

```
Portal de editais (UFRN)
        │  fetch + Cheerio
        ▼
  editais-scraper ──► pdf-extractor ──► SummarizeEdital (OpenAI)
        │                                      │
        ▼                                      ▼
    PostgreSQL  ◄──────────────────────  resumo por edital
        │
        ▼
   filas BullMQ ──► whatsapp-web.js ──► aluno
```

Os módulos em `src/modules`:

| Módulo | Responsabilidade |
|---|---|
| `web_scrapping` | Scraping do portal, extração de PDFs e os providers/consumers (BullMQ) que orquestram a coleta e as notificações |
| `ai_chat` | `SummarizeEdital` — transforma o texto do PDF no resumo estruturado enviado no WhatsApp |
| `whatsapp` | Cliente `whatsapp-web.js`: login por QR code, watchdog de inicialização e o roteador de comandos (`!login`, `!ping`, etc.) |
| `edital` / `pdf` | Persistência dos editais e seus anexos |
| `user` | Cadastro dos alunos e vínculo com os editais de interesse |
| `sends` | Registro de qual PDF de qual edital já foi enviado para qual aluno, evitando duplicidade |
| `files` | Upload para storage S3-compatível via `@aws-sdk/lib-storage` — implementado, mas nenhum fluxo do bot o usa hoje |
| `reminders` | Modelo de dados (`Reminders`) já existe no Prisma, mas o módulo é um stub vazio — funcionalidade ainda não implementada |
| `puppeteer` | Utilitário à parte, sem relação com o pipeline de editais: conecta a um Chrome local (`--remote-debugging-port=9222`) para inspecionar os campos de um Google Form autenticado |

As filas de `web_scrapping` (BullMQ, visíveis em `/queues`):

- `getNewEditais` — descobre editais novos, extrai os PDFs, resume com IA e persiste
- `notifyNewEditais` — envia aos alunos o resumo dos editais que ainda não receberam
- `sendPdf` — varre os PDFs ativos atrás do nome de cada aluno e envia o que encontrar (homologação, entrevista, resultado etc.)

E o provider que roda fora de fila:

- `finish-editais` — compara os editais ativos no banco com o que ainda está "Em andamento" no site e desativa os que saíram de lá

## Stack

- **NestJS 11** + TypeScript (ESM)
- **Prisma 7** + PostgreSQL (via `@prisma/adapter-pg`)
- **Puppeteer** e **Cheerio** — scraping
- **pdf-parse** — extração de texto dos editais
- **whatsapp-web.js** — cliente de WhatsApp (login por QR code)
- **OpenAI SDK** — resumo dos editais, com `LLM_BASE_URL` configurável para qualquer endpoint compatível
- **BullMQ** + Redis, com Bull Board em `/queues`
- **MinIO / S3** — storage S3-compatível para o módulo `files` (ainda não usado por nenhum fluxo)
- **Pino** + Loki + Grafana — logging estruturado

## Modelo de dados

| Model | Papel |
|---|---|
| `Edital` | Edital do portal: badge, título, link, prazo de inscrição, resumo e palavras-chave |
| `Pdf` | Anexo do edital, com o texto extraído e o tipo (`EDITAL`, `HOMOLOGACAO`, `ENTREVISTA`, `CURRICULO`, `RESULTADO`) |
| `User` | Aluno cadastrado: nome, `chatId`/contato do WhatsApp e status ativo |
| `Sends` | Registro do que já foi enviado para quem (chave composta `pdfId + editalId + userId`) |
| `Reminders` | Modelo pronto no banco para lembretes por aluno; sem lógica implementada ainda |

## Rodando localmente

**Requisitos:** Node.js, PostgreSQL e Redis. MinIO só é necessário se algo passar a usar o módulo `files`.

```bash
yarn install
yarn migrate        # prisma migrate dev + generate
yarn dev            # nest start --watch
```

Na primeira execução o `whatsapp-web.js` imprime um QR code no terminal — escaneie com o WhatsApp que enviará as mensagens. A sessão fica em `.wwebjs_auth/` e não precisa ser refeita.

### Variáveis de ambiente

```bash
NODE_ENV=development
PORT=7638
PUBLIC_URL=http://localhost:7638

DATABASE_URL=          # conexão PostgreSQL

REDIS_HOST=
REDIS_PORT=

# usadas pelo módulo `files`; nenhum fluxo do bot as chama hoje
MINIO_URL=
MINIO_REGION=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

LOKI_URL=              # destino dos logs
LOG_LEVEL=info

OPENAI_API_KEY=
LLM_BASE_URL=          # endpoint compatível com a API da OpenAI
LLM_MODEL=             # default: gpt-4o-mini
```

Veja `.env.example` para a lista completa, incluindo as variáveis de porta usadas pelo `docker-compose.yml`.

## Rodando com Docker

O `docker-compose.yml` sobe a aplicação junto com Postgres, Redis, Loki e Grafana.

```bash
cp .env.example .env   # ajuste OPENAI_API_KEY
docker compose up -d --build
docker compose logs -f app   # o QR code do WhatsApp aparece aqui
```

As migrations do Prisma (`prisma migrate deploy`) rodam automaticamente no start do container.

| Serviço | Endereço |
|---|---|
| API | http://localhost:7638 |
| Bull Board | http://localhost:7638/queues |
| Grafana (logs do Loki) | http://localhost:3001 |
| Postgres | `localhost:5433` |
| Redis | `localhost:6380` |

As portas publicadas podem ser trocadas no `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `LOKI_PORT`, `GRAFANA_PORT`, `PORT`).

A sessão do WhatsApp fica nos volumes `wwebjs_auth`/`wwebjs_cache`, então o QR code só é escaneado uma vez — mesmo entre `docker compose down` e `up`. Para começar do zero: `docker compose down -v`.

## Rotas

As etapas do pipeline também podem ser disparadas por HTTP (ver `main.http`):

| Rota | O que faz |
|---|---|
| `GET /editais/getNewEditais` | Faz o scraping e enfileira editais novos para resumo e persistência |
| `GET /editais/notifyNewEditais` | Enfileira o envio dos editais novos aos alunos |
| `GET /editais/notifyPdfs` | Enfileira a busca e o envio de PDFs que citam cada aluno |
| `GET /editais/finishEditais` | Desativa no banco os editais que saíram do "Em andamento" do site |
| `GET /queues` | Bull Board |

## Estado atual / limitações conhecidas

- O `docker-compose.yml` não sobe um serviço MinIO, embora `.env.example` e o módulo `files` referenciem variáveis `MINIO_*` — hoje isso só importa se algo passar a chamar `UploadOne`, o que não acontece em nenhum fluxo atual.
- `@nestjs/bullmq`, `bullmq` e `@bull-board/*` estão em `devDependencies`, mas são importados em código de produção (`app.module.ts`, `web_scrapping.module.ts`). Uma instalação sem dev deps quebra o boot.
- O script `whatsapp:browser` aponta para `scripts/whatsapp-browser.js`, que não existe no repositório.
- O módulo `reminders` tem o modelo de dados pronto no Prisma, mas nenhuma lógica implementada nem está registrado em `AppModule`.
