# Modelo do Power BI — Rede de Ensaios RS

## Fonte

`C:\Users\ipaula\Downloads\template_rede_ensaios_rs.xlsx`

Em cada consulta, remover a primeira linha e promover a linha seguinte como cabeçalho.

## Relacionamentos

- `LOCAIS[local_id*]` 1 → * `ENSAIOS[local_id*]`
- `ENSAIOS[ensaio_id*]` 1 → * `PLANEJAMENTO[ensaio_id*]`
- `ENSAIOS[ensaio_id*]` 1 → * `ATIVIDADES_REALIZADAS[ensaio_id*]`

Direção de filtro simples, da dimensão para as tabelas de detalhe.

## Páginas

1. **Visão geral** — mapa, cartões, prioridades e filtros.
2. **Ensaios** — distribuição por local, tipo, prioridade e tabela detalhada.
3. **Planejamento** — atividades por mês, categoria, responsável e agenda.
4. **Histórico** — atividades realizadas, cobertura de registros e observações.

## Mapa

- Latitude: `LOCAIS[latitude*]`
- Longitude: `LOCAIS[longitude*]`
- Local: `LOCAIS[nome_local*]`
- Tamanho: medida `[Parcelas por Local]`
- Legenda: `LOCAIS[regiao]`

## Filtros globais

- Região
- Local
- Tipo de ensaio
- Prioridade
- Responsável
- Status
