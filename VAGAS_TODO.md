# UFRN

## Fontes já implementadas

### imd (feito)

- Site: https://www.metropoledigital.ufrn.br/portal/editais
- Volume de tech: ~100 editais/ano publicados no portal (IDs sequenciais em `/portal/visualizar/{id}`: 600 em fev/2024, 700 em fev/2025, 898 em out/2026), a maioria bolsas de projetos de P&D em TI (dev, IA, UX, cibersegurança)
- Vagas por mês: ~9 editais/mês (98 entre nov/2025 e out/2026), ~7-8 de tech
- Ruído: baixo — ~15% não é vaga de tech (eleição de coordenador, apoio administrativo na secretaria, programas de estudo)

### sti (feito)

- Site: https://sti.ufrn.br/oportunidades/processos-seletivos-edital
- Volume de tech: ~9 editais/ano (4 em 2024, 7 em 2025, 15 em 2026 até setembro), bolsas de dev full stack, back-end, mobile, IA, redes, SOC
- Vagas por mês: ~1/mês na média de 3 anos (28 editais entre out/2023 e out/2026); em 2026 subiu para ~1,7/mês
- Ruído: baixo — ~15% não é tech (bolsista de comunicação, ginástica laboral, qualidade de vida)
- Obs: a API do WordPress também tem `editais-encerrados` (73 editais desde 2016), útil para histórico

### jerimum (feito)

- Site: https://jerimumjobs.imd.ufrn.br/jerimumjobs/oportunidade/listar
- Volume de tech: ~11 vagas novas em 3 semanas de coleta (set–out/2026); o site só mostra vagas abertas, sem histórico, então não dá para medir por ano
- Vagas por mês: ~15/mês (~10 de tech) — provavelmente superestimado, pois a primeira coleta pegou as vagas que já estavam abertas
- Ruído: médio — ~30% é vendas/marketing/comercial
- Obs: vagas de empresas (CLT, estágio), não editais

## Fontes a implementar

### funpec

Fazer web scrape da funpec, sai vaga para Dev 3 vezes ao ano, maioria CLT podendo ou nao precisar de graduação
https://funpec.br/processo-seletivo/processo-seletivo-04-2024-programador-de-sistemas-de-informacao-cadastro-de-reserva/

- Site: https://funpec.br/processos-seletivos/novos/ e https://funpec.br/processos-seletivos/em-andamento/
- Volume de tech: ~4 processos/ano (12 entre out/2023 e out/2026), vagas CLT
- Vagas por mês: ~0,3/mês (1 processo de tech a cada ~3 meses)
- Ruído: alto — ~80% dos processos não são de TI (cuidador, advogado, psicólogo...)
- Obs: WordPress com HTML server-side; info útil no Anexo I do PDF (cargo, salário, requisitos). Filtrar por cargo "Programador" (aceita graduação em andamento); "Analista"/"Engenheiro" exigem graduação completa

### lais

- Site: https://lais.huol.ufrn.br/categoria/editais/
- Volume de tech: ~5 editais/ano (15 entre out/2023 e out/2026), cada edital com vários perfis (back, front, UX, mobile, DevOps), bolsas de R$ 2.000 a R$ 6.000
- Vagas por mês: ~0,4/mês (1 edital de tech a cada ~2-3 meses, mas cada um traz de 2 a 7 perfis)
- Ruído: alto — ~metade dos editais é de saúde/fonoaudiologia/administração
- Obs: WordPress com API REST (`/wp-json/wp/v2/posts?categories=9`) que já devolve o link do PDF. Stack de cada perfil fica no Anexo II. Republica os mesmos perfis em editais novos (ex.: ReAbLITA 003, 007 e 009/2025) — dedupe por projeto + perfil, não só por link

### ect

- Site: https://www.ect.ufrn.br/documentos/?tipo=editais
- Volume de tech: ~1-2 editais/ano (4 entre out/2023 e out/2026), bolsas para graduandos (ex.: Edital 01/2026 dev full stack Node/React/Next, R$ 3.000)
- Vagas por mês: ~0,1/mês (1 edital de tech a cada ~9 meses)
- Ruído: muito alto — a maioria é dispensa de componente curricular, bolsa de mestrado/doutorado ou eleição
- Obs: listagem única sem paginação, PDF na página de detalhe, inscrição por Google Forms

# Fora da UFRN

## Fontes a implementar

### github (vagas remotas)

- Site: https://github.com/backend-br/vagas/issues, https://github.com/frontendbr/vagas/issues, https://github.com/qa-brasil/vagas/issues, https://github.com/react-brasil/vagas/issues
- Volume de tech: ~590 vagas/ano somando os 4 repos (backend-br 347, frontendbr 150, qa-brasil 50, react-brasil 40, entre out/2025 e out/2026)
- Vagas por mês: ~49/mês (backend-br ~29, frontendbr ~12, qa-brasil ~4, react-brasil ~3)
- Ruído: muito baixo — tudo é vaga de tech
- Obs: API oficial do GitHub (issues), labels já classificam (Remoto, Júnior, CLT, PJ...) sem precisar de PDF/IA. Nenhuma vaga mencionava Natal — é fonte de vagas remotas, então o bot precisa de campo de localidade (Natal presencial / híbrido / remoto) e de vínculo (bolsa / CLT / PJ / estágio)

### senac rn

- Site: https://trabalheconosco.rn.senac.br/
- Volume de tech: ~6 vagas/ano de tech (2026: Técnico TI – Desenvolvimento, Analista IV – Dados e Analytics, Assistente TI – Infraestrutura 2x, Suporte On-line), mais ~5 de instrutor/professor de TI
- Vagas por mês: ~0,5/mês de tech (~1/mês contando instrutor de TI)
- Ruído: muito alto — ~90 avisos no ano, a maioria hotelaria/serviços gerais (camareiro, cozinha, jardineiro...)
- Obs: uma página só lista todos os avisos do ano com status (Em Andamento / Encerrado) e PDFs (`/edital/arquivo_{id}.pdf`); vagas CLT em Natal

### bne / gupy (empresas privadas)

- Site: https://www.bne.com.br/vagas-de-emprego-para-desenvolvedor-em-natal-rn e https://portal.gupy.io/
- Volume de tech: não medido
- Vagas por mês: não medido
- Ruído: alto no BNE — muita vaga com "desenvolvedor" no título é comercial/vendas
- Obs: BNE tem páginas por cidade + cargo (HTML). Gupy é onde muitas empresas de Natal recrutam, mas os endpoints de API pública conhecidos (`portal.api.gupy.io/api/job`, `employability-portal.gupy.io/api/v1/jobs`) deram 404 — investigar como o portal faz a busca por cidade. Mais frágeis que as outras fontes
