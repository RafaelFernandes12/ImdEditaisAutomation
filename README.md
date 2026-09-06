# IMD Editais Automation

Bot de WhatsApp que monitora o [portal de editais do IMD/UFRN](https://www.metropoledigital.ufrn.br/portal/editais), resume cada vaga com IA e acompanha o aluno por todas as etapas do processo seletivo — tudo pelo WhatsApp.

O problema que ele resolve: os editais do IMD saem sem aviso, cada um é um PDF com várias vagas dentro, e as etapas seguintes (homologação, análise curricular, entrevista, resultado) são publicadas como novos anexos no mesmo edital. Quem não fica atualizando o portal manualmente perde prazo.

## O que ele faz

1. **Descobre editais novos.** Faz scraping do portal com Puppeteer e Cheerio, identificando editais ainda não vistos.
2. **Lê os PDFs.** Extrai o texto de cada anexo do edital com `pdf-parse` e guarda no banco.
3. **Resume cada vaga.** Um LLM transforma o PDF em um resumo estruturado — uma entrada por vaga, com remuneração, carga horária, duração, palavras-chave e elegibilidade. Um único edital costuma ter 2 a 4 vagas distintas.
4. **Notifica os alunos cadastrados** por WhatsApp assim que o edital sai.
5. **Acompanha o processo até o fim.** Quando um novo anexo é publicado (homologação, currículo, entrevista, resultado), o aluno recebe a atualização daquele edital — sem receber duas vezes o mesmo documento.

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

*Vaga:* DESENVOLVEDOR(A) BACKEND
*Qtd vagas:* 2
...
```

### Cadastro do aluno

O cadastro acontece dentro da própria conversa do WhatsApp, em etapas:

| Etapa | Campo | Obrigatório |
|---|---|---|
| 1 | Nome completo | sim |
| 2 | Matrícula | sim |
| 3 | Currículo Vitae (PDF) | não |
| 4 | Currículo Lattes (PDF) | não |

Os currículos anexados vão para o storage e são usados para ordenar as vagas por interesse do aluno.

## Arquitetura

```
Portal de editais (UFRN)
        │  Puppeteer + Cheerio
        ▼
  editais-scraper ──► pdf-extractor ──► SummarizeEdital (LLM)
        │                                      │
        ▼                                      ▼
    PostgreSQL  ◄──────────────────────  resumo por vaga
        │
        ▼
  providers de notificação ──► whatsapp-web.js ──► aluno
```

Os módulos em `src/modules`:

| Módulo | Responsabilidade |
|---|---|
| `web_scrapping` | Scraping do portal, extração de PDFs e os providers que orquestram as notificações |
| `ai_chat` | `SummarizeEdital` — transforma o texto do PDF no resumo estruturado por vaga |
| `whatsapp` | Cliente `whatsapp-web.js`, fluxo de login e envio das mensagens |
| `edital` / `pdf` | Persistência dos editais e seus anexos |
| `user` | Cadastro dos alunos e vínculo com os editais de interesse |
| `edital_to_user` / `pdf_sends` | Controle de o que já foi enviado para quem, evitando duplicidade |
| `files` | Upload dos currículos para o storage S3-compatível |
| `puppeteer` | Browser compartilhado |

Os providers de `web_scrapping` são as quatro etapas do pipeline:

- `get-new-editais` — descobre e persiste editais novos
- `notify-new-editais` — envia o resumo do edital recém-publicado
- `notify-homologados` — avisa sobre a homologação das inscrições
- `notify-pdfs` — envia os anexos seguintes (currículo, entrevista, resultado)
- `finish-editais` — encerra o acompanhamento quando o processo termina

## Stack

- **NestJS 11** + TypeScript (ESM)
- **Prisma 7** + PostgreSQL (via `@prisma/adapter-pg`)
- **Puppeteer** e **Cheerio** — scraping
- **pdf-parse** — extração de texto dos editais
- **whatsapp-web.js** — cliente de WhatsApp (login por QR code)
- **OpenAI SDK** — resumo dos editais, com `LLM_BASE_URL` configurável para qualquer endpoint compatível
- **BullMQ** + Redis, com Bull Board em `/queues`
- **MinIO / S3** — armazenamento dos currículos
- **Pino** + Loki — logging estruturado

## Modelo de dados

| Model | Papel |
|---|---|
| `Edital` | Edital do portal: título, link, prazo de inscrição, resumo e palavras-chave |
| `Pdf` | Anexo do edital, com o texto extraído e o tipo (`EDITAL`, `HOMOLOGACAO`, `ENTREVISTA`, `CURRICULO`, `RESULTADO`) |
| `User` | Aluno cadastrado: nome, matrícula, contato e currículos |
| `EditalToUser` | Vínculo aluno↔edital com o status do processo (`SENDED`, `HOMOLOGACAO`, `ENTREVISTA`, `RESERVA`, `SUCESS`, `FAILED`) |
| `Sends` / `PdfSends` | Registro do que já foi enviado, para não repetir mensagem |
| `AiChat` | Histórico das conversas com o LLM |

## Rodando localmente

**Requisitos:** Node.js, PostgreSQL, Redis e um bucket S3-compatível (MinIO).

```bash
yarn install
yarn migrate        # prisma migrate dev + generate
yarn dev            # nest start --watch
```

Na primeira execução o `whatsapp-web.js` imprime um QR code no terminal — escaneie com o WhatsApp que enviará as mensagens. A sessão fica em `.wwebjs_auth/` e não precisa ser refeita.

### Variáveis de ambiente

```bash
DATABASE_URL=          # conexão PostgreSQL
PORT=3030

OPENAI_API_KEY=
LLM_BASE_URL=          # endpoint compatível com a API da OpenAI
LLM_MODEL=             # default: gpt-4o-mini

REDIS_HOST=
REDIS_PORT=

MINIO_URL=
MINIO_REGION=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

LOKI_URL=              # destino dos logs
```

## Rodando com Docker

O `docker-compose.yml` sobe a aplicação junto com Postgres, Redis, MinIO (com o bucket `editaisimd` já criado), Loki e Grafana.

```bash
cp .env.example .env   # ajuste OPENAI_API_KEY e as credenciais do MinIO
docker compose up -d --build
docker compose logs -f app   # o QR code do WhatsApp aparece aqui
```

As migrations do Prisma (`prisma migrate deploy`) rodam automaticamente no start do container.

| Serviço | Endereço |
|---|---|
| API | http://localhost:7638 |
| Bull Board | http://localhost:7638/queues |
| MinIO (console) | http://localhost:9001 |
| Grafana (logs do Loki) | http://localhost:3000 |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |

Se você já tiver Postgres, Redis, MinIO, Loki ou Grafana rodando na máquina, as portas publicadas podem ser trocadas no `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, `LOKI_PORT`, `GRAFANA_PORT`, `PORT`) — ou suba só a aplicação com `docker compose up -d app` apontando as variáveis para os serviços existentes.

A sessão do WhatsApp fica no volume `wwebjs_auth`, então o QR code só é escaneado uma vez — mesmo entre `docker compose down` e `up`. Para começar do zero: `docker compose down -v`.

O `GET /puppeteer` é a exceção: ele se conecta a um Chrome real rodando na máquina host (`--remote-debugging-port=9222`) e, a partir do container, precisaria apontar para `host.docker.internal` em vez de `127.0.0.1`.

## Rotas

As etapas do pipeline são disparadas por HTTP (ver `main.http`):

| Rota | O que faz |
|---|---|
| `GET /editais/getNewEditais` | Faz o scraping e persiste editais novos |
| `GET /editais/notifyNewEditais` | Envia os editais novos aos alunos |
| `GET /editais/notifyHomolog` | Notifica a homologação das inscrições |
| `GET /editais/notifyPdfs` | Envia os anexos seguintes do processo |
| `GET /queues` | Bull Board |

## Estado atual

- Os `@Cron` dos providers estão **comentados** — hoje o pipeline roda pelas rotas HTTP acima. Para automatizar, basta descomentar os decorators em `src/modules/web_scrapping/providers/`.
- `@nestjs/bullmq`, `bullmq` e `@bull-board/*` estão em `devDependencies`, mas são importados em `app.module.ts`. Uma instalação sem dev deps quebra o boot.
- O script `whatsapp:browser` aponta para `scripts/whatsapp-browser.js`, que não existe no repositório.
