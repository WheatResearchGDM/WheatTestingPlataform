import type { Trial, MacroGroup } from '../domain/types';

export function groupFromCategory(category?: string): MacroGroup {
  const value = String(category ?? '').toLowerCase();
  if (value.includes('founder')) return 'Founder';
  if (value.includes('cole')) return 'Coleção';
  if (value.includes('multi')) return 'Multiqualidades';
  if (/^pd|\bpd\b/.test(value)) return 'PD';
  if (value.includes('outro')) return 'Outro';
  return 'Ensaios';
}

export function macroGroupFor(trial: Trial): MacroGroup {
  if (trial.areaCategory) return groupFromCategory(trial.areaCategory);
  const value = `${trial.type} ${trial.name}`.toLowerCase();
  if (value.includes('founder')) return 'Founder';
  if (value.includes('cole')) return 'Coleção';
  if (value.includes('multi')) return 'Multiqualidades';
  if (/(^|[\s_-])pd([\s_-]|$)/.test(value)) return 'PD';
  if (value.includes('outro')) return 'Outro';
  return 'Ensaios';
}

