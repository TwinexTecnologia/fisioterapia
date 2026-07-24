# Debug Session: dashboard-load-delay

- Status: OPEN
- Symptom: apos o login do fisioterapeuta, a tela inicial do dashboard fica vazia por alguns segundos antes de preencher.
- Expected: o dashboard deve preencher rapidamente com os dados principais logo apos o login.
- Scope: runtime web app, fluxo de autenticacao e hidratacao inicial do dashboard.

## Hypotheses

1. Uma chamada critica do dashboard esta lenta e segura a hidratacao inicial.
2. O dashboard renderiza com estado vazio e so recebe os dados apos uma cadeia de promises terminar.
3. Existe retry, timeout ou espera artificial levando o carregamento para perto de 10s.
4. O carregamento especifico do fisioterapeuta consulta perfis/liberacoes de forma custosa.
5. Cache local/sessao nao esta sendo reaproveitado e o app sempre faz carga completa ao entrar.

## Evidence Log

- Instrumentacao adicionada em `app.js` nos pontos:
- submit do login
- carga do contexto autenticado
- aplicacao do contexto no app
- inicio/fim da hidratacao do dashboard
- query de modulos
- carga de perfis gerenciados
- primeiro render do dashboard

## Next Step

- Reproduzir o login do fisioterapeuta e coletar os eventos no Debug Server para confirmar qual etapa concentra a latencia.
