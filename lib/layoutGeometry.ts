type Point = [number, number];
type Parcel = { plot: { trialId: string; row: number; col: number }; positions: Point[] };
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list: Point[]) => { const result: Point[] = []; for (const point of list) { while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop(); result.push(point); } return result; };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}
/** Only the outer parcels of each row are needed for a lightweight convex silhouette. */
export function trialSilhouettes(parcels: Parcel[]) {
  const trials = new Map<string, Map<number, { first: Parcel; last: Parcel }>>();
  for (const parcel of parcels) {
    if (!trials.has(parcel.plot.trialId)) trials.set(parcel.plot.trialId, new Map());
    const rows = trials.get(parcel.plot.trialId)!;
    const row = rows.get(parcel.plot.row);
    if (!row) rows.set(parcel.plot.row, { first: parcel, last: parcel });
    else { if (parcel.plot.col < row.first.plot.col) row.first = parcel; if (parcel.plot.col > row.last.plot.col) row.last = parcel; }
  }
  return [...trials].map(([id, rows]) => ({ id, positions: hull([...rows.values()].flatMap((row) => [...row.first.positions, ...row.last.positions])) }));
}

export function translateSilhouette(points: Point[], from: Point, to: Point): Point[] {
  return points.map(([lat, lng]) => [lat + to[0] - from[0], lng + to[1] - from[1]]);
}
