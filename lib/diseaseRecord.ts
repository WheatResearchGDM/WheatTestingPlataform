export const diseaseOptions = [
  ['mosaico', 'Mosaico'], ['giberela', 'Giberela'], ['ferrugem', 'Ferrugem'],
  ['oidio', 'Oídio'], ['mancha_bacteriana', 'Mancha bacteriana'], ['outros', 'Outros'],
] as const;

export function diseaseRecordDetails(severity: number, ids: string[], notes: string): Record<string, string> {
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) throw new Error('Informe a nota geral de doenças entre 1 e 5.');
  const selected = severity <= 1 ? [] : [...new Set(ids.filter((id) => diseaseOptions.some(([known]) => known === id)))];
  if (severity > 1 && !selected.length) throw new Error('Selecione as doenças identificadas ou marque Outros.');
  return { doencas: String(severity), doencas_ids: selected.join(';'), doencas_identificadas: diseaseOptions.filter(([id]) => selected.includes(id)).map(([, label]) => label).join('; '), doencas_observacoes: severity > 1 ? notes.trim() : '', ...Object.fromEntries(diseaseOptions.map(([id]) => ['doenca_' + id, selected.includes(id) ? 'Sim' : 'Não'])) };
}
