import type { Cell, Worksheet } from 'exceljs';
import type { LayoutPlot } from '../domain/layout';


export function spreadsheetText(cell: Cell): string {
  // ExcelJS cell.text calls .toString() on the master of merged cells.
  // An empty merged master is null, which used to abort the entire import.
  let value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) value = cell.result ?? value.result ?? null;
  if (value == null) return '';
  const number = typeof value === 'number' ? value : value && typeof value === 'object' && 'result' in value && typeof value.result === 'number' ? value.result : undefined;
  if (number !== undefined && Number.isInteger(number) && /^0+$/.test(cell.numFmt ?? '')) return String(number).padStart(cell.numFmt.length, '0');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  if ('richText' in value) return value.richText.map((part) => part?.text ?? '').join('').trim();
  if ('text' in value) return String(value.text ?? '').trim();
  return '';
}

/** Visit occupied cells only; formatting far outside the field cannot create huge grids. */
export function parsePlantingSheet(sheet: Worksheet, fillColor: (fill: unknown) => string | undefined): LayoutPlot[] {
  const cells: Array<{ id: string; row: number; col: number; color?: string }> = [];
  let lastRow = 0;
  sheet.eachRow((row, rowNumber) => row.eachCell((cell, col) => {
    const id = spreadsheetText(cell);
    if (!id) return;
    if (cells.length >= 50000) throw new Error('Divida o arquivo em mapas de até 50.000 parcelas.');
    lastRow = Math.max(lastRow, rowNumber);
    cells.push({ id, row: rowNumber, col, color: fillColor(cell.fill) });
  }));
  if (!cells.length) throw new Error('Nenhuma parcela foi encontrada na primeira aba.');
  return cells.map((cell) => {
    const utility = /PULV/i.test(cell.id) ? 'PULV' : /LNX/i.test(cell.id) ? 'LNX' : 'UNASSIGNED';
    return { plotId: cell.id, row: lastRow - cell.row + 1, col: cell.col, genotype: '', trialId: utility, sourceTrialId: utility, excelColor: cell.color };
  });
}
