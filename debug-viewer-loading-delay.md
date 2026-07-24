[OPEN] Viewer loading delay

## Contexto
- Sintoma: os 4 modulos aparecem rapido no visualizador, mas o estado `Carregando...` ainda demora para sumir.
- Esperado: a lista entrar praticamente instantanea e substituir placeholders quase no mesmo momento.
- Escopo atual: tela de modulos do fisioterapeuta visualizador no mobile.

## Hipoteses
1. A query inicial do visualizador ainda retorna vazia ou incompleta no primeiro ciclo.
2. A hidratacao dos modulos termina depois do primeiro render e o repaint final esta atrasado.
3. O merge entre placeholders e modulos reais mantem itens `allowed-placeholder` mais tempo que o necessario.
4. A imagem/capa do modulo depende de dados adicionais e segura o card em loading.

## Plano
1. Instrumentar login/hidratacao/render da tela de modulos do visualizador.
2. Reproduzir no celular e coletar logs do primeiro paint ate o fim do loading.
3. Confirmar ou refutar as hipoteses com base nos tempos e estados reais.
4. Aplicar o menor fix possivel e comparar logs antes/depois.
