/** Column schema stored once per map instead of repeating property names per parcel. */
export function stringifyLayout(value: unknown): string {
  return JSON.stringify(value, (key, item) => {
    if (key !== 'plots' || !Array.isArray(item) || !item.length) return item;
    const keys = [...new Set(item.flatMap((plot) => Object.keys(plot)))];
    return { layoutTable: 1, keys, rows: item.map((plot) => { const row = keys.map((name) => plot[name] ?? null); while (row.at(-1) === null) row.pop(); return row; }) };
  });
}
export function parseLayout<T>(text: string): T {
  return JSON.parse(text, (_key, item) => item?.layoutTable === 1 && Array.isArray(item.keys) && Array.isArray(item.rows)
    ? item.rows.map((row: unknown[]) => Object.fromEntries(item.keys.flatMap((key: string, index: number) => row[index] == null ? [] : [[key, row[index]]]))) : item) as T;
}
