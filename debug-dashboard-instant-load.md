# Debug Session: dashboard-instant-load
- **Status**: OPEN
- **Issue**: apos o login, o dashboard ainda demora para mostrar os dados visiveis; meta atual e exibir os dados em cerca de 1 segundo.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-dashboard-instant-load.ndjson

## Reproduction Steps
1. Abrir o sistema com a build atual.
2. Fazer login com um perfil que cai no dashboard.
3. Medir o tempo entre o submit do login e a primeira exibicao visivel dos cards com dados.
4. Comparar primeiro login e segundo login no mesmo navegador.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O atraso principal restante vem da carga de perfis gerenciados, nao mais da carga de modulos. | High | Med | Rejected parcialmente: o erro observado continuou concentrado em `modules`. |
| B | O app restaura cache, mas o primeiro render util ainda acontece tarde demais. | High | Med | Pending: instrumentacao nova adicionada para medir cache restore, render e paint. |
| C | O custo de renderizacao do dashboard apos obter os dados ainda e alto o bastante para ser percebido. | Med | Med | Pending: instrumentacao nova adicionada para medir render e paint. |
| D | A build testada nao contem a branch/commits mais recentes do dashboard. | Med | Low | Pending: houve indicio de build desalinhada por erros antigos de debug em `127.0.0.1:7777/event`. |
| E | Existe outra etapa critica no fluxo autenticado bloqueando a tela antes do dashboard pintar. | Med | Med | Confirmed parcialmente: a leitura de `modules` segue estourando timeout mesmo em modo resumido. |

## Log Evidence
- Browser runtime no deploy autenticado exibiu `Erro ao carregar modulos apos autenticar` com `code: 57014` e `message: canceling statement due to statement timeout`.
- A query do dashboard estava resumida em colunas, mas ampla em linhas:
  - `GET /rest/v1/modules?select=id,owner_id,slug,name,description,status,cover_image_url,created_at,updated_at&order=created_at.asc`
- A investigacao mostrou que o filtro por perfil estava acontecendo so depois da resposta voltar ao frontend.
- Nova instrumentacao adicionada em `app.js` para a sessao `dashboard-instant-load`, medindo:
  - submit do login
  - auth context aplicado
  - hydration start/finish
  - modules query com indicacao de `hasOwnerFilter`
  - profiles load
  - renderState start
  - dashboard rendered
  - dashboard paint

## Current Fix Attempt
- Aplicado filtro SQL por `owner_id` na leitura de `modules` quando o perfil autenticado e `fisio_admin`.
- Objetivo: reduzir o scan no banco antes da ordenacao e evitar timeout no carregamento inicial do dashboard.

## Verification Conclusion
- Pendente: precisa rodar com a nova build e comparar o tempo ate o primeiro paint util do dashboard.
