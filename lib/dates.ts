export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function todayIso() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
