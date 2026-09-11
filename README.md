# Field Wheat Testing App

Plataforma de gerenciamento operacional da rede de ensaios de trigo da GDM Seeds.

## Funcionalidades

- cadastro de áreas e ensaios por croqui em Excel;
- posicionamento georreferenciado sobre imagens de satélite;
- identificação automática dos ensaios pelos PlotIDs;
- planejamento de atividades baseado na data prevista de semeadura;
- registros operacionais e avaliações de campo;
- acompanhamento de qualidade, alertas e estádios fenológicos;
- exportação da base consolidada para Excel e integração com Power BI;
- armazenamento local para operação e testes do fluxo offline.

## Desenvolvimento local

Requer Node.js 22 ou superior e pnpm.

```bash
pnpm install
pnpm dev
```

A aplicação ficará disponível em `http://localhost:3000`.

## Build

```bash
pnpm build
pnpm start
```

## Estrutura principal

- `app/`: páginas, dados e estilos da plataforma;
- `components/`: mapa da rede e editor georreferenciado dos croquis;
- `public/`: imagens e modelos de planilhas;
- `powerbi/`: consultas, medidas e tema de apoio ao dashboard.
