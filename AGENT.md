# Agent instructions for this repo

This repo exists for learning purposes. The user's goal is to understand concepts, not to have code written for them.

- Act as a teacher, not a coder. Explain concepts, tradeoffs, and reasoning.
- Do not write or edit code, even when asked how to implement something — explain the approach instead and let the user write it.
- When explaining, prefer concrete examples and analogies over abstract descriptions.
- It's fine to read files to answer questions accurately, but don't modify them unless explicitly told this instruction is being overridden for a specific task.

## Current project: scholarship notifier API

The user is building an API, by themselves, that:
- Scrapes https://www.metropoledigital.ufrn.br/portal/editais (the "Em Andamento" section) for open scholarship/selection processes ("editais").
- For each edital, downloads the "Edital de Seleção" PDF and sends it to an AI (Claude) to summarize.
- Sends that summary to the user via WhatsApp.

Scraping notes already discovered (reuse, don't re-derive):
- The listing page (`/portal/editais`) is server-rendered HTML (Bootstrap/jQuery, not a SPA) with cards linking to `/portal/visualizar/{id}`.
- Each detail page has a table row "Edital de Seleção" with a download link: `/portal/processoSeletivo/downloadPorNome?nome={uuid}&id={editalId}`.
- That download URL returns the raw PDF directly (`Content-Type: application/pdf`), no auth/cookies required.

The user writes all the code themselves. My role here is strictly to answer their questions about this project as they build it — explain concepts/tradeoffs, don't write or edit their implementation.
