# Xadrez — Duelo no tabuleiro

Um jogo de xadrez para navegador, feito com HTML, CSS e JavaScript puro. Jogue uma partida local com outra pessoa ou enfrente a IA em três níveis de dificuldade.

## Funcionalidades

- Partidas locais para dois jogadores ou contra a IA.
- Níveis de dificuldade fácil, médio e difícil.
- Validação de movimentos e regras como xeque, xeque-mate, roque, captura en passant e promoção de peões.
- Histórico de lances e opção para desfazer movimentos.
- Contabilização de vitórias, derrotas, empates e desistências, salva no armazenamento local do navegador.
- Layout responsivo e interface em português.

## Como jogar

1. Abra `index.html` em um navegador ou sirva a pasta por um servidor local.
2. Escolha entre **Dois jogadores** e **Contra a IA**. No modo IA, selecione também a dificuldade.
3. Clique em uma peça e depois na casa de destino. As casas legais são destacadas.
4. Use **Desfazer** para voltar um lance ou **Nova partida** para iniciar outro jogo.

As opções de modo e dificuldade escolhidas valem para a próxima partida. No modo contra a IA, você joga com as brancas.

## Executar localmente

Não é necessário instalar dependências nem compilar o projeto. Com Python instalado, inicie um servidor na pasta do projeto:

```bash
python -m http.server 8000
```

Depois, acesse <http://localhost:8000> no navegador. Também é possível usar uma extensão de servidor local no editor.

## Estrutura

| Arquivo | Descrição |
| --- | --- |
| `index.html` | Estrutura da página, tabuleiro e controles. |
| `style.css` | Estilos, estados visuais e layout responsivo. |
| `script.js` | Regras do jogo, interface, estatísticas e lógica da IA. |

## Tecnologias

- HTML5
- CSS3
- JavaScript (ES6+)

O projeto não utiliza bibliotecas ou serviços externos. As estatísticas ficam no `localStorage` do navegador em que as partidas são jogadas.

## Licença

Nenhuma licença foi definida neste repositório. Escolha e adicione uma licença antes de permitir reutilização ou redistribuição do código.
