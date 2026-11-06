# Job Seeker — vagas e editais de TI em Natal pelo WhatsApp

Bot de WhatsApp que coleta vagas de desenvolvimento e editais de bolsa de várias fontes (portais da UFRN, sites de emprego e repositórios do GitHub), resume cada uma com IA e manda para os usuários cadastrados só o que combina com o perfil deles, numa única mensagem, ordenada por compatibilidade.

O problema que ele resolve: as oportunidades de TI em Natal estão espalhadas por uma dúzia de sites, os editais da UFRN saem sem aviso (cada um é um PDF com várias vagas dentro e ganha anexos ao longo do processo: homologação, entrevista, resultado), e quem não fica atualizando tudo na mão perde prazo.

## O que ele faz

1. **Coleta** vagas e editais novos de [todas as fontes](#fontes) a cada 2 horas. Uma fonte que falha não impede as outras.
2. **Lê os PDFs** dos editais (`pdf-parse`) e o texto das páginas das vagas.
3. **Resume com IA.** Um LLM (SDK da OpenAI, endpoint configurável) transforma o texto num resumo estruturado: remuneração, carga horária, duração, palavras-chave, ecossistema, senioridade, formato e elegibilidade. Quando a fonte já informa algum desses dados de forma estruturada, o dado da fonte vale mais que a leitura da IA. Salários em moeda estrangeira são convertidos para real.
4. **Rankeia por usuário.** Cada vaga recebe uma nota conforme as preferências do usuário (ecossistema, cidade, formato, modelo de contratação, senioridade, escolaridade, salário), com pesos próprios de cada fonte. Vagas em Natal sobem na lista. Editais e vagas das fontes locais da UFRN (IMD, STI, Jerimum Jobs, FUNPEC, LAIS, ECT) vão sempre: nesses casos a nota só decide a ordem.
5. **Notifica** cada usuário com uma mensagem só, juntando as vagas novas de todas as fontes, sem repetir o que ele já recebeu.
6. **Envia PDFs que citam o usuário pelo nome**, como listas de homologados e resultados, assim que aparecem.
7. **Encerra** no banco as vagas e editais que saíram do ar ou fecharam na fonte.

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

## Fontes

São 14 fontes, cada uma numa classe em `src/modules/web_scrapping/sources/`. Elas são de dois tipos:

- **EDITAL**: processo seletivo publicado em PDF. O bot guarda os anexos e procura neles o nome dos usuários.
- **VAGA**: vaga de emprego ou estágio, lida da página ou da API do portal.

Abaixo estão as URLs exatamente como o código monta, com todos os parâmetros. Onde aparece `{id}` ou similar, o valor vem da listagem.

| Fonte | Tipo | Como lê | Arquivo |
|---|---|---|---|
| [IMD](#imd) | EDITAL | HTML + PDFs | `imd.source.ts` |
| [STI](#sti) | EDITAL | API WordPress (JSON) + PDFs | `sti.source.ts` |
| [LAIS](#lais) | EDITAL | HTML paginado + PDFs | `lais.source.ts` |
| [FUNPEC](#funpec) | EDITAL | HTML paginado + PDFs | `funpec.source.ts` |
| [ECT](#ect) | EDITAL | HTML + PDFs | `ect.source.ts` |
| [Jerimum Jobs](#jerimum-jobs) | VAGA | HTML | `jerimun.source.ts` |
| [Gupy](#gupy) | VAGA | API JSON + página da vaga | `gupy.source.ts` |
| [LinkedIn](#linkedin) | VAGA | Rotas públicas sem login (HTML) | `linkedin.source.ts` |
| [InfoJobs](#infojobs) | VAGA | HTML | `infojobs.source.ts` |
| [Sólides](#sólides) | VAGA | API JSON paginada | `solides.source.ts` |
| [BNE](#bne) | VAGA | HTML paginado (JSON-LD na vaga) | `bne.source.ts` |
| [Senior](#senior) | VAGA | API JSON via POST | `senior.source.ts` |
| [GitHub Backend / Frontend](#github) | VAGA | API do GitHub (issues) | `github.source.ts` |

### Portais da UFRN e de Natal

#### IMD

Instituto Metrópole Digital. Uma página só, sem paginação.

- Listagem: <https://www.metropoledigital.ufrn.br/portal/editais>
  - Editais novos: caixa `.box-editais-andamentos` ("Em andamento").
  - Encerramento: caixa `.box-editais-encerrados` da mesma página. O edital só é encerrado quando aparece nela.
- Página do edital: `https://www.metropoledigital.ufrn.br/portal/visualizar/{id}`
- PDFs: os links da tabela `table.tb_noticias` da página do edital, no formato `https://www.metropoledigital.ufrn.br/portal/processoSeletivo/downloadPorNome?nome={uuid}&id={id}`

#### STI

Superintendência de Tecnologia da Informação da UFRN. A página pública é uma SPA em Vue que vem vazia no HTML, então a fonte lê direto a API do WordPress por trás dela. Sem paginação.

- API: <https://webcache02-producao.info.ufrn.br/admin/sinfo/wp-json/wp/v2/editais-em-andamento>
- Link enviado ao usuário: `https://sti.ufrn.br/oportunidades/processos-seletivos-edital/{id}`
- PDFs: o campo `acf.arquivos[].acf.anexo` de cada edital no JSON.

#### LAIS

Laboratório de Inovação Tecnológica em Saúde. Pagina até vir uma página vazia, com teto de 20 páginas. Só entra edital que cita algum termo de ecossistema de TI no título ou nos PDFs.

- Editais novos (`aberto`):
  - Página 1: <https://lais.huol.ufrn.br/categoria/editais/?edital_status=aberto>
  - Página 2 em diante: <https://lais.huol.ufrn.br/categoria/editais/page/2/?edital_status=aberto>, `/page/3/`…
- Encerramento: lê `aberto` e `andamento` e encerra o que não está em nenhuma das duas.
  - <https://lais.huol.ufrn.br/categoria/editais/?edital_status=andamento>
  - <https://lais.huol.ufrn.br/categoria/editais/page/2/?edital_status=andamento>…

#### FUNPEC

Fundação Norte-Rio-Grandense de Pesquisa e Cultura. Pagina até vir uma página vazia, com teto de 20 páginas. Mesmo filtro de ecossistema de TI do LAIS.

- Processos novos (`novos`):
  - Página 1: <https://funpec.br/processos-seletivos/novos/>
  - Página 2 em diante: <https://funpec.br/processos-seletivos/novos/?pagina=2>, `?pagina=3`…
- Encerramento: lê `novos` e `em-andamento` e encerra o que não está em nenhuma das duas.
  - <https://funpec.br/processos-seletivos/em-andamento/>
  - <https://funpec.br/processos-seletivos/em-andamento/?pagina=2>…
- A data final de inscrição sai do texto do PDF ("As inscrições estarão abertas… até…").

#### ECT

Escola de Ciências e Tecnologia da UFRN. Uma página só, com todas as abas. Mesmo filtro de ecossistema de TI do LAIS.

- Listagem: <https://www.ect.ufrn.br/documentos/?tipo=editais>
  - Editais novos: aba "novo".
  - Encerramento: encerra o que não está nas abas "novo" nem "em andamento".
- PDFs: os links da página de cada edital.

#### Jerimum Jobs

Portal de vagas do IMD. Uma página só. O certificado TLS do site é inválido, então a requisição desliga a verificação (`rejectUnauthorized: false`).

- Listagem: <https://jerimumjobs.imd.ufrn.br/jerimumjobs/oportunidade/listar> (links dentro de `#vagas-filtradas`)
- Página da vaga: `https://jerimumjobs.imd.ufrn.br{href do link}`

### Portais de emprego

#### Gupy

Uma requisição por termo (`desenvolvedor`, `developer`, `software`), 100 vagas cada, sem paginação (`offset=0`), mais recentes primeiro.

- Busca:
  - <https://portal.gupy.io/api/job-search/jobs?jobName=desenvolvedor&city=Natal&state=Rio+Grande+do+Norte&limit=100&offset=0&sortBy=publishedDate&sortOrder=desc>
  - <https://portal.gupy.io/api/job-search/jobs?jobName=developer&city=Natal&state=Rio+Grande+do+Norte&limit=100&offset=0&sortBy=publishedDate&sortOrder=desc>
  - <https://portal.gupy.io/api/job-search/jobs?jobName=software&city=Natal&state=Rio+Grande+do+Norte&limit=100&offset=0&sortBy=publishedDate&sortOrder=desc>
- Página da vaga: o `jobUrl` de cada resultado, no formato `https://{empresa}.gupy.io/jobs/{id}`. Os dados saem do `__NEXT_DATA__` da página, e só entram vagas com `status: published`. Links fora de `*.gupy.io` são descartados.
- A busca nacional (mesma URL sem `city` e `state`) está comentada em `LOCATIONS`.

#### LinkedIn

Rotas que a página pública de vagas usa sem login. Até 5 páginas de 10 vagas (`MAX_PAGES = 5`), publicadas na última semana (`f_TPR=r604800`), mais recentes primeiro (`sortBy=DD`). Em Natal a semana costuma ter umas 3 páginas, e a primeira página incompleta encerra a busca.

- Busca: <https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=desenvolvedor&location=Natal%2C+Rio+Grande+do+Norte%2C+Brasil&f_TPR=r604800&sortBy=DD&start=0>
  - Página 2 em diante: o `start` anda de 10 em 10 (`start=10`, `start=20`… até `start=40`).
- Detalhe da vaga: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}`
- Link enviado ao usuário: `https://www.linkedin.com/jobs/view/{id}/`
- A busca nacional (`BRASIL_PARAMS`, frase longa de júnior/estágio/trainee, últimas 3 horas) está comentada em `SEARCHES`.

#### InfoJobs

Uma página, categoria 74 (informática), presencial e híbrido (`idw=1,3`), só vagas publicadas ou renovadas no dia (`Antiguedad=1`), ordenada por data. A vaga é encerrada 15 dias depois de publicada. Em Natal essa busca quase sempre vem vazia ("Nenhuma vaga foi encontrada"), e o log registra isso como `list.no_results`, não como HTML quebrado.

- Busca: <https://www.infojobs.com.br/vagas-de-emprego-desenvolvedor-em-natal,-rn.aspx?categoria=74&campo=griddate&orden=desc&Antiguedad=1&idw=1%2C3>
- Página da vaga: o `data-href` de cada card, resolvido contra `https://www.infojobs.com.br`. Os dados saem do JSON-LD da página.
- A busca remota (`/vagas-de-emprego-desenvolvedor.aspx` com `idw=2`) está comentada em `SEARCHES`.

#### Sólides

Rota que a página de busca do portal usa, sem token. 25 vagas por página (acima disso a API falha). Para na última página, na página que passa de 30 dias ou na 10ª página.

- Busca:
  - Página 1: <https://vagas.solides.com.br/api/vacancies?page=1&take=25&locations=Natal+-+RN>
  - Página 2 em diante: <https://vagas.solides.com.br/api/vacancies?page=2&take=25&locations=Natal+-+RN>, `page=3`… até `page=10`
- Link enviado ao usuário: `publishers.rhgestor.redirectUrl` quando existe, senão `https://vagas.solides.com.br/vaga/{id}`

#### BNE

Banco Nacional de Empregos, área de informática em Natal. Lê só as páginas: o `robots.txt` do BNE fecha `/api/` para robôs. 20 vagas por página, as ativas antes das encerradas. Para na primeira encerrada ou na 5ª página.

- Busca:
  - Página 1: <https://www.bne.com.br/vagas-de-emprego-na-area-de-informatica?Area=Informatica&CityName=natal-rn&Page=1>
  - Página 2 em diante: <https://www.bne.com.br/vagas-de-emprego-na-area-de-informatica?Area=Informatica&CityName=natal-rn&Page=2>, `Page=3`… até `Page=5`
- Página da vaga: o campo `Url` de cada resultado. Os dados saem do JSON-LD da página.

#### Senior

Portais de talentos da Senior. As rotas não têm documentação e são POST com corpo JSON, então não abrem no navegador. A busca é a mesma para todas as empresas. 50 vagas por página, até a última página ou a 5ª.

- Busca: `POST https://platform.senior.com.br/t/senior.com.br/bridge/1.0/anonymous/rest/hcm/careersmanagercandidate/queries/searchVacancies`

  ```json
  {
    "page": 0,
    "size": 50,
    "filter": "",
    "match": {
      "companies": [
        { "id": "fd128524-fc49-4a41-958e-613771d730d4" },
        { "id": "af8cf633-17ff-4452-a734-2cd932fe67f0" }
      ]
    }
  }
  ```

  A paginação anda pelo `page` (`0`, `1`, `2`…).
- Detalhe da vaga: `POST https://platform.senior.com.br/t/senior.com.br/bridge/1.0/anonymous/rest/hcm/careersmanagercandidate/queries/findVacancyById` com `{ "id": "{id}" }`
- Link enviado ao usuário (portal de cada empresa):
  - Unimed Natal: `https://vagasunimednatal.portaldetalentos.senior.com.br/vacancy/{id}` ([portal](https://vagasunimednatal.portaldetalentos.senior.com.br))
  - Gentil Negócios: `https://gentilnegocios.portaldetalentos.senior.com.br/vacancy/{id}` ([portal](https://gentilnegocios.portaldetalentos.senior.com.br))
- Só entram vagas no RN (a Gentil Negócios publica vagas de lojas de outros estados).

### GitHub

#### GitHub Backend / Frontend

Issues abertas dos repositórios de vagas, 100 por requisição, sem paginação. Usa `GITHUB_TOKEN` (`Authorization: Bearer`).

- GitHub Backend ([backend-br/vagas](https://github.com/backend-br/vagas/issues)): <https://api.github.com/repos/backend-br/vagas/issues?state=open&per_page=100>
- GitHub Frontend ([frontendbr/vagas](https://github.com/frontendbr/vagas/issues)): <https://api.github.com/repos/frontendbr/vagas/issues?state=open&per_page=100>
- Link enviado ao usuário: o `html_url` da issue.

### Adicionando uma fonte

Uma fonte é uma classe que implementa `JobSource` (`sources/job.source.ts`):

- `list()`: lista o que está aberto na fonte (link + tipo).
- `fetchDetails(jobs)`: busca o detalhe só do que ainda não está no banco.
- `findFinished(active)` (opcional): diz quais vagas ativas fecharam. Sem ele, encerra o que sumiu da listagem.
- `weight`: os pesos de cada critério no ranking para os tipos dessa fonte.

Depois é preciso adicionar o tipo no enum `JobType` do Prisma e em `src/modules/jobs/job-types.ts`, e registrar a classe em `SOURCES` (`web_scrapping.module.ts`). No boot, `assertCoversAllJobTypes` confere que cada `JobType` tem exatamente uma fonte.

## Cadastro e comandos no WhatsApp

O cadastro acontece na própria conversa: o usuário manda `!login Seu Nome Completo` e já é vinculado aos editais em andamento. As preferências padrão são ecossistemas de TI, Natal/RN, qualquer formato e só vagas nacionais.

| Comando | O que faz |
|---|---|
| `!login <nome>` | Cadastra o usuário e mostra as vagas em andamento |
| `!vagas` | Lista as vagas abertas |
| `!vagas andamento` | Lista as vagas e editais em andamento |
| `!citado` | Lista os editais em que o nome do usuário foi citado |
| `!desativar` | Para de receber as mensagens automáticas |
| `!reativar` | Volta a receber as mensagens |
| `!ping` | Responde `pong`, para checar se o bot está no ar |

Também existe um cadastro completo por formulário web (rotas `/cadastro/:token`, usadas pelo app em `../job_seeker_web`), com ecossistemas, formato, modelo, senioridade, escolaridade e cidade (lista do IBGE). Hoje o `!login` cadastra direto e não envia esse link.

## Arquitetura

```
 14 fontes (HTML, APIs, PDFs)
        │  fetch + Cheerio + pdf-parse
        ▼
 GetNewJobsProvider (@Cron a cada 2h)
        │  flow BullMQ "notifyAll"
        ├──► getNewJobs ──► SummarizeJob (LLM) ──► PostgreSQL
        ├──► finishJobs ──► desativa o que fechou na fonte
        ▼
 notifyAll (roda quando os filhos terminam)
        ├──► notifyNewJobs ──► rankVagas (preferências) ──► whatsapp-web.js ──► usuário
        └──► sendPdf ──────► PDFs que citam o nome ───────► whatsapp-web.js ──► usuário
```

Filas BullMQ (visíveis em `/queues`):

| Fila | O que faz |
|---|---|
| `getNewJobs` | Uma tarefa por vaga ou edital novo: resume com IA, converte moeda e grava |
| `finishJobs` | Desativa no banco o que fechou ou sumiu de cada fonte |
| `notifyAll` | Pai do flow: quando a coleta e o encerramento terminam, dispara as notificações |
| `notifyNewJobs` | Uma tarefa por usuário: rankeia as vagas que ele ainda não recebeu e envia |
| `sendPdf` | Procura o nome de cada usuário nos PDFs ativos e envia os que o citam |

Módulos em `src/modules`:

| Módulo | Responsabilidade |
|---|---|
| `web_scrapping` | Fontes, filtros de ecossistema, extração de PDFs, ranking e os providers/consumers das filas |
| `ai_chat` | `SummarizeJob`: transforma o texto da vaga ou do PDF no resumo estruturado |
| `jobs` | Persistência das vagas e editais (`Job` e `Vaga`) e o tipo de cada fonte (`job-types.ts`) |
| `pdf` | Anexos dos editais |
| `user` / `user-subscription` | Usuários, preferências e vínculo com as vagas já enviadas |
| `sends` | Registro do que já foi enviado para quem |
| `whatsapp` | Cliente `whatsapp-web.js` (login por QR code), roteador de comandos e rotas do cadastro web |
| `files` | Upload para storage S3-compatível. Implementado, mas nenhum fluxo usa |
| `reminders` | Só o modelo no Prisma. Não tem lógica nem está registrado no `AppModule` |
| `puppeteer` | Utilitário à parte: conecta a um Chrome local (`--remote-debugging-port=9222`) para inspecionar um Google Form |

## Modelo de dados

| Model | Papel |
|---|---|
| `Job` | Vaga ou edital coletado: tipo (fonte), kind (`EDITAL`/`VAGA`), link, prazo de inscrição, validade e status ativo |
| `Vaga` | Cada vaga dentro de um `Job`, com o resumo e os atributos usados no ranking (ecossistema, salário, formato, cidade, modelo, senioridade, escolaridade) |
| `Pdf` | Anexo de um edital, com o texto extraído e o tipo (`EDITAL`, `HOMOLOGACAO`, `ENTREVISTA`, `CURRICULO`, `RESULTADO`) |
| `User` | Usuário cadastrado: nome, `chatId`/contato do WhatsApp e status ativo |
| `UserPreferences` | Preferências que alimentam o ranking |
| `Sends` | O que já foi enviado para quem (único por `userId + jobId + pdfId`) |
| `Reminders` | Modelo pronto para lembretes, sem lógica ainda |

## Stack

- **NestJS 11** + TypeScript (ESM)
- **Prisma 7** + PostgreSQL (`@prisma/adapter-pg`)
- **Cheerio** + `fetch`/`undici` para o scraping, **pdf-parse** para os PDFs
- **whatsapp-web.js**: cliente de WhatsApp com login por QR code
- **SDK da OpenAI**, com `LLM_BASE_URL` para qualquer endpoint compatível
- **BullMQ** + Redis, com Bull Board em `/queues`
- **Pino** + Loki + Grafana para os logs estruturados

## Rodando localmente

**Requisitos:** Node.js, PostgreSQL e Redis.

```bash
cp .env.example .env   # preencha OPENAI_API_KEY e GITHUB_TOKEN
yarn install
yarn migrate           # prisma migrate dev + generate
yarn dev               # nest start --watch
```

Na primeira execução o `whatsapp-web.js` imprime um QR code no terminal: escaneie com o WhatsApp que vai enviar as mensagens. A sessão fica em `.wwebjs_auth/` e não precisa ser refeita.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PORT` | Porta da API (padrão `7638`) |
| `DATABASE_URL` | Conexão com o PostgreSQL |
| `REDIS_HOST`, `REDIS_PORT` | Redis do BullMQ |
| `OPENAI_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | LLM que resume as vagas (`LLM_MODEL` padrão: `gpt-4o-mini`) |
| `GITHUB_TOKEN` | Token para a API do GitHub (fontes GitHub Backend/Frontend) |
| `WEB_URL` | Endereço do formulário de cadastro web |
| `LOKI_URL`, `LOG_LEVEL` | Destino e nível dos logs |
| `MINIO_*` | Storage do módulo `files` (nenhum fluxo usa hoje) |
| `WA_BROWSER_URL` | Opcional, em dev: Chrome do WhatsApp rodando à parte (`yarn whatsapp:browser`) |

O `.env.example` traz a lista completa, incluindo as portas publicadas pelo `docker-compose.yml`.

## Rodando com Docker

O `docker-compose.yml` sobe a aplicação com Postgres, Redis, Loki e Grafana.

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f app   # o QR code do WhatsApp aparece aqui
```

As migrations (`prisma migrate deploy`) rodam sozinhas no start do container. A sessão do WhatsApp fica nos volumes `wwebjs_auth`/`wwebjs_cache`, então o QR code só é escaneado uma vez, mesmo entre `down` e `up`. Para começar do zero: `docker compose down -v`.

| Serviço | Endereço (portas padrão do compose) |
|---|---|
| API | http://localhost:7638 |
| Bull Board | http://localhost:7638/queues |
| Grafana (logs do Loki) | http://localhost:3001 |
| Postgres | `localhost:5433` |
| Redis | `localhost:6380` |

As portas podem ser trocadas no `.env` (`PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `LOKI_PORT`, `GRAFANA_PORT`). O `.env.example` já define algumas delas com outros valores.

## Rotas

Tudo que o cron faz também pode ser disparado por HTTP (exemplos em `main.http`).

| Rota | O que faz |
|---|---|
| `GET /scrape/getNewJobs` | Coleta todas as fontes e dispara o flow completo (resumo, encerramento e notificações), igual ao cron |
| `GET /scrape/get{Fonte}Source` | Coleta só uma fonte e devolve o resultado, sem enfileirar. `{Fonte}`: `Imd`, `Sti`, `Lais`, `Funpec`, `Ect`, `Gupy`, `Linkedin`, `Infojobs`, `Solides`, `Bne`, `Senior` |
| `GET /scrape/jerimumJobs`, `GET /scrape/githubJobs` | O mesmo, para Jerimum Jobs e GitHub |
| `GET /scrape/finishJobs` | Desativa o que fechou nas fontes |
| `GET /scrape/notifyNewJobs` | Envia aos usuários as vagas novas |
| `GET /scrape/notifyPdfs` | Envia os PDFs que citam cada usuário |
| `GET /jobs/getJobs` | Lista as vagas e editais ativos |
| `GET /cadastro/:token`, `POST /cadastro/:token`, `GET /cadastro/cidades/:uf` | Cadastro pelo formulário web |
| `GET /queues` | Bull Board |

## Limitações conhecidas

- `@nestjs/bullmq`, `bullmq` e `@bull-board/*` estão em `devDependencies`, mas são importados em código de produção. Uma instalação sem as dev deps quebra o boot.
- O `docker-compose.yml` não sobe MinIO, embora `.env.example` e o módulo `files` usem `MINIO_*`. Só importa se algum fluxo passar a chamar o upload.
- Os links de cadastro web ficam em memória e deixam de valer se o servidor reiniciar.
- O módulo `reminders` tem só o modelo de dados.
- As fontes leem rotas sem documentação oficial (Gupy, LinkedIn, Sólides, Senior, STI) e HTML de terceiros. Uma mudança de layout ou de API quebra a fonte. Nesse caso as outras fontes continuam funcionando e a falha aparece no log `source_failed`.
