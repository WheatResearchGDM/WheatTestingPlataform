# Rodada funcional beta — 0.2.0-beta.1

Esta rodada revisa os fluxos existentes e reorganiza seus pontos críticos, preservando os cadastros do navegador. Não executa limpeza automática de dados.

## Organização

| Responsabilidade | Código principal |
| --- | --- |
| Tipos do domínio | `domain/types.ts`, `domain/layout.ts` |
| Geração por lista e importação Excel | `lib/listLayout.ts`, `lib/plantingImport.ts` |
| Validação do croqui | `lib/layoutValidation.ts` |
| Criação e edição do planejamento | `lib/fieldPlanning.ts` |
| Gravação consistente e recuperação de falhas | `lib/storage.ts`, `lib/harvestRepository.ts` |
| Situação operacional real dos ensaios | `lib/fieldStatus.ts`, `lib/trialGroups.ts` |
| Armazenamento compacto compatível com mapas anteriores | `lib/layoutStorage.ts` |
| Geometria e prévia de movimento | `lib/layoutGeometry.ts`, `components/LayoutMovePreview.tsx` |
| Interface e estilos do editor | `components/FieldLayoutMap.tsx`, `app/field-layout.css` |
| Recuperação de erro de renderização | `components/ApplicationBoundary.tsx` |

`app/page.tsx` continua coordenando telas e fluxos legados. A extração prioriza regras compartilhadas e persistência para evitar duplicação das novas funcionalidades; não representa uma reescrita integral de todas as telas.

## Correções e proteções

- Salvar mapa e aplicar lista têm barras de ações fora das áreas de rolagem. O botão de salvar permanece visível, inclusive após salvar; mensagens de validação ficam junto às ações.
- Movimentação usa contornos convexos dos ensaios, em uma camada de desenho separada com 50% de transparência. Não recalcula parcelas durante a prévia. Um clique no ícone ativa o movimento da silhueta com o cursor; o segundo clique fixa a posição. Esc cancela. O contorno é uma aproximação externa e pode abranger intervalos vazios.
- Locais e ensaios usam estado React por instância, em vez de arrays globais mutáveis.
- Mapas, ensaios, atividades, planejamento e metadados da safra são gravados em lote nos fluxos principais. Falha de gravação restaura os valores anteriores antes de apresentar erro. Isso protege contra falhas síncronas; localStorage não é um banco transacional resistente a fechamento abrupto do navegador.
- Editar o croqui preserva atividades concluídas, datas realizadas e registros existentes. Remover um ensaio com registros durante uma edição é bloqueado; a exclusão explícita permanece no gerenciamento.
- Reordenar a lista não muda a identificação do ensaio. Mapas anteriores continuam sendo lidos.
- A importação visita células ocupadas, preserva zeros à esquerda e cores e ignora formatação distante da grade. PlotIDs repetidos geram aviso que pode ser ignorado; cada célula mantém sua própria seleção e ocorrência. Parcelas sem ensaio, dimensões inválidas e datas inválidas impedem a conclusão com mensagem clara.
- Importações antigas não são aplicadas a outro mapa quando o usuário troca de contexto.
- Semeadura e colheita usam registros operacionais. Datas previstas não contam como execução. Atrasos usam a data atual de São Paulo.
- Exclusão de local remove também o catálogo de croquis. Exclusão de ensaio libera suas parcelas no mapa para impedir recriação acidental.
- O cache offline fica limitado à aplicação. Uma falha ao carregar um arquivo JavaScript não recebe HTML no lugar do arquivo.

## Validação

Execute `pnpm typecheck`, `pnpm test` e `pnpm build:github-pages`. A publicação automática agora exige validação de tipos e regressões antes do build.

A verificação de tipos também rejeita variáveis e parâmetros sem uso. Formulários antigos que já não eram utilizados e caminhos obsoletos de cadastro foram removidos. Os dados públicos existentes não são apagados por esta atualização.

Os testes cobrem zigue-zague, quebras e ordem, compactação e compatibilidade de armazenamento, roteamento com custos assimétricos, rollback por falha de gravação, edição com atividades concluídas, vários mapas por local, silhuetas com 10 mil parcelas, planilhas esparsas, cores, fórmulas e zeros à esquerda.

Na verificação visual local foram carregadas mil parcelas. Foram conferidos: cancelar movimento sem alterar coordenadas; confirmar e salvar a posição; manter o botão de salvar após a gravação; salvar e começar outro mapa; visibilidade do botão em uma janela de 869 × 463. O teste com 10 mil parcelas valida a geometria do contorno, não é uma medição de taxa de quadros em todos os aparelhos.

Para conferir a rodada beta, use arquivos de teste e valide: importar grade, definir ensaios, salvar e reabrir; gerar por lista e reordenar; salvar e carregar outro mapa; arrastar, cancelar e confirmar posição; registrar semeadura com enchimento pendente; conferir calendário e síntese; anexar e reabrir fotos; testar rotas; exportar consolidação.

## Limites desta beta

Os registros e fotos continuam locais ao navegador, sem sincronização entre aparelhos. O login e as permissões são demonstrativos e não substituem autenticação/autorização no servidor. Não usar como base única de dados de produção. O arquivo de recuperação inclui dados JSON, mas não os blobs das fotos.

As rotas dependem de OSRM, sem trânsito em tempo real. O cálculo maior que 12 paradas usa aproximação. O mapa satélite depende da disponibilidade de imagens do provedor. Algumas telas administrativas legadas ainda têm controles demonstrativos; a rodada funcional deve seguir os fluxos descritos acima. Não há garantia de ausência de todos os defeitos; achados da rodada devem registrar tela, arquivo usado e passos de reprodução.

## Ajuste de registro de doenças

A nota geral de severidade é única. Quando há doenças, o registro permite selecionar Mosaico, Giberela, Ferrugem, Oídio, Mancha bacteriana e Outros, com observação textual. A consolidação exporta a nota geral, as doenças selecionadas e a descrição. Fora do perfilhamento, estabelecimento e uniformidade exibem apenas suas notas com ícone de bloqueio discreto.
