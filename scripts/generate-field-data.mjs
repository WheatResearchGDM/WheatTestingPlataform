import { basename } from 'node:path';
import { writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const { Workbook } = ExcelJS;

const [sourcePath, outputPath = 'app/data/rede.ts'] = process.argv.slice(2);
if (!sourcePath) throw new Error('Informe a planilha de origem.');

const workbook = new Workbook();
await workbook.xlsx.readFile(sourcePath);
const worksheet = workbook.getWorksheet('Gestão da Safra') ?? workbook.worksheets[0];
if (!worksheet) throw new Error('A planilha não contém abas.');

function valueOf(cellValue) {
  if (cellValue instanceof Date) return cellValue.toISOString().slice(0, 10);
  if (cellValue && typeof cellValue === 'object') {
    if ('result' in cellValue) return valueOf(cellValue.result);
    if ('text' in cellValue) return String(cellValue.text ?? '');
    if ('richText' in cellValue) return cellValue.richText.map((part) => part.text).join('');
  }
  return cellValue ?? '';
}

const headers = worksheet.getRow(3).values.slice(1).map((value) => String(valueOf(value)).trim());
const rows = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber <= 3) return;
  const record = Object.fromEntries(headers.map((header, index) => [header, valueOf(row.getCell(index + 1).value)]));
  if (String(record.local_codigo ?? '').trim()) rows.push(record);
});

const clean = (value) => String(value ?? '').trim();
const number = (value) => Number(value) || 0;
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
const date = (value, fallback) => validDate(value) ? clean(value) : fallback;
const unique = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
const sourceFilename = basename(sourcePath);
const importedAt = sourceFilename.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? new Date().toISOString().slice(0, 10);

function addDays(iso, days) {
  const result = new Date(`${iso}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
}

function shortDate(iso) {
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const parsed = new Date(`${iso}T12:00:00Z`);
  return `${String(parsed.getUTCDate()).padStart(2, '0')} de ${months[parsed.getUTCMonth()]}`;
}

const normalizedSource = rows.map((row) => {
  const normalized = Object.fromEntries(headers.map((header) => [header, valueOf(row[header])]));
  if (!validDate(normalized.data_realizada)) {
    for (const field of ['data_realizada', 'checklist_concluido', 'qualidade_grupo_nota', 'estabelecimento_nota', 'uniformidade_nota', 'daninhas_nota', 'controle_daninhas', 'oidio_nota', 'ferrugem_nota', 'manchas_nota', 'fotos', 'nota_qualidade', 'classificacao']) normalized[field] = '';
  }
  return normalized;
});

const trialRows = unique(normalizedSource, (row) => clean(row.ensaio_codigo));
const planRows = unique(normalizedSource, (row) => clean(row.visita_codigo));

const importedPlanning = planRows.map((row, index) => {
  const start = date(row.data_prevista, date(row.data_semeadura, importedAt));
  const rawStatus = clean(row.status_planejamento) || 'Não iniciado';
  return {
    id: clean(row.visita_codigo) || `VIS-${index + 1}`,
    trialId: clean(row.ensaio_codigo),
    activity: clean(row.atividade_descricao) || 'Atividade de campo',
    category: clean(row.estadio_fenologico) || 'Condução',
    start,
    end: start,
    owner: clean(row.responsavel) || 'Equipe de campo',
    priority: clean(row.prioridade) || 'Normal',
    status: /finalizado|conclu[ií]do/i.test(rawStatus) ? 'Concluído' : rawStatus,
    notes: clean(row.observacoes) || 'Importado da planilha de gestão',
    originalStart: start,
    originalEnd: start,
    version: 1,
  };
}).filter((item) => item.trialId);

const importedLocations = unique(normalizedSource, (row) => clean(row.local_codigo)).map((row) => {
  const id = clean(row.local_codigo);
  const localTrials = trialRows.filter((trial) => clean(trial.local_codigo) === id);
  const localTrialIds = new Set(localTrials.map((trial) => clean(trial.ensaio_codigo)));
  const localPlans = importedPlanning.filter((plan) => localTrialIds.has(plan.trialId));
  const overdue = localPlans.some((plan) => plan.status !== 'Concluído' && plan.start < importedAt);
  const attention = localPlans.some((plan) => plan.status !== 'Concluído' && daysBetween(importedAt, plan.start) >= 0 && daysBetween(importedAt, plan.start) <= 7);
  return {
    id,
    name: clean(row.local_nome) || id,
    city: [clean(row.municipio), clean(row.uf)].filter(Boolean).join(' - '),
    region: clean(row.tipo_area) || 'CROQUI',
    lat: number(row.latitude),
    lng: number(row.longitude),
    trials: localTrials.length,
    plots: localTrials.reduce((sum, trial) => sum + number(trial.parcelas), 0),
    status: overdue ? 'late' : attention ? 'attention' : 'ok',
  };
});

const importedTrials = trialRows.map((row) => {
  const id = clean(row.ensaio_codigo);
  const location = importedLocations.find((item) => item.id === clean(row.local_codigo));
  const sowing = date(row.data_semeadura, date(row.data_semeadura_prevista, importedAt));
  const harvest = addDays(sowing, 120);
  const plans = importedPlanning.filter((plan) => plan.trialId === id && plan.status !== 'Concluído');
  const nextPlan = [...plans].sort((a, b) => {
    const aFuture = a.start >= importedAt ? 0 : 1;
    const bFuture = b.start >= importedAt ? 0 : 1;
    return aFuture - bFuture || Math.abs(daysBetween(importedAt, a.start)) - Math.abs(daysBetween(importedAt, b.start));
  })[0];
  const overdue = plans.some((plan) => plan.start < importedAt);
  const progress = Math.max(0, Math.min(100, Math.round((daysBetween(sowing, importedAt) / 120) * 100)));
  return {
    id,
    name: clean(row.ensaio_nome) || id,
    type: clean(row.grupo) || 'Outro',
    subtype: clean(row.subtipo_ensaio),
    year: Number(sowing.slice(0, 4)) || 2026,
    cycle: `Safra ${sowing.slice(0, 4) || '2026'}`,
    locationId: clean(row.local_codigo),
    plots: number(row.parcelas),
    sowing,
    harvest,
    owner: clean(row.responsavel) || 'Equipe de campo',
    rawStatus: progress > 0 ? 'Em andamento' : 'Planejado',
    priority: clean(row.prioridade) || 'Normal',
    notes: clean(row.observacoes),
    place: location?.name ?? clean(row.local_nome),
    city: location?.city ?? clean(row.municipio),
    status: overdue ? 'Atenção' : progress > 0 ? 'Em andamento' : 'Planejado',
    progress,
    next: nextPlan?.activity ?? 'Sem atividade pendente',
    nextDate: nextPlan?.start ?? harvest,
    date: shortDate(nextPlan?.start ?? harvest),
    fieldName: clean(row.campo_nome) || clean(row.campo_codigo),
  };
});

const importedActivities = normalizedSource.filter((row) => validDate(row.data_realizada)).map((row, index) => ({
  id: index + 1,
  date: clean(row.data_realizada),
  trial: clean(row.ensaio_codigo),
  type: clean(row.estadio_fenologico) || 'Visita',
  owner: clean(row.responsavel) || 'Equipe de campo',
  notes: clean(row.observacoes) || 'Registro importado da planilha de gestão',
  plannedId: clean(row.visita_codigo),
  locationId: clean(row.local_codigo),
}));

const importedUsers = [
  { id: 'USR001', name: 'Igor', email: 'igor@exemplo.com', role: 'Administrador', active: true, locations: 'Todos', notes: 'Usuário demonstrativo' },
  { id: 'USR002', name: 'João', email: 'joao@exemplo.com', role: 'Pesquisador', active: true, locations: 'COX-1', notes: 'Usuário demonstrativo' },
  { id: 'USR003', name: 'Carlos', email: 'carlos@exemplo.com', role: 'Campo', active: true, locations: 'COX-1;PF-2026-001', notes: 'Usuário demonstrativo' },
];

const sourceSummary = {
  filename: sourceFilename,
  importedAt,
  locations: importedLocations.length,
  trials: importedTrials.length,
  plans: importedPlanning.length,
  activities: importedActivities.length,
  users: importedUsers.length,
  plots: importedTrials.reduce((sum, trial) => sum + trial.plots, 0),
};

const sourceCode = [
  `// Dados gerados de ${sourceFilename} em ${importedAt}.`,
  '// Os campos de atividade realizada só são importados quando contêm uma data ISO válida.',
  `export const sourceSummary = ${JSON.stringify(sourceSummary)} as const;`,
  `export const importedLocations = ${JSON.stringify(importedLocations)} as const;`,
  `export const importedTrials = ${JSON.stringify(importedTrials)} as const;`,
  `export const importedPlanning = ${JSON.stringify(importedPlanning)} as const;`,
  `export const importedActivities = ${JSON.stringify(importedActivities)} as const;`,
  `export const importedUsers = ${JSON.stringify(importedUsers)} as const;`,
  `export const importedSource = ${JSON.stringify(normalizedSource)} as const;`,
  '',
].join('\n');

await writeFile(outputPath, sourceCode, 'utf8');
console.log(JSON.stringify(sourceSummary));
