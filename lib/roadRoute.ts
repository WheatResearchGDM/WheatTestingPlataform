export type RoadPoint = { lat: number; lng: number };
export type RoadResult = { order: number[]; legs: Array<{ seconds: number; meters: number }>; coordinates: [number, number][]; exact: boolean };

// Open path from index 0; asymmetric costs support one-way roads.
export function optimizeOrder(cost: number[][], roundTrip = false): number[] {
  const count = cost.length - 1;
  if (count < 1) return [];
  if (cost.some((row) => row.length !== count + 1 || row.some((n) => !Number.isFinite(n) || n < 0))) throw new Error('Não foi possível conectar todos os locais por estrada.');
  const pathCost = (path: number[]) => path.reduce((sum, to, i) => sum + cost[i ? path[i - 1] : 0][to], 0) + (roundTrip ? cost[path[path.length - 1]][0] : 0);
  if (count <= 12) {
    const size = 1 << count;
    const dp = Array.from({ length: size }, () => new Float64Array(count).fill(Infinity));
    const parent = Array.from({ length: size }, () => new Int16Array(count).fill(-1));
    for (let end = 0; end < count; end++) dp[1 << end][end] = cost[0][end + 1];
    for (let mask = 1; mask < size; mask++) for (let end = 0; end < count; end++) {
      if (!(mask & (1 << end))) continue;
      const previous = mask ^ (1 << end);
      if (!previous) continue;
      for (let prev = 0; prev < count; prev++) if (previous & (1 << prev)) {
        const candidate = dp[previous][prev] + cost[prev + 1][end + 1];
        if (candidate < dp[mask][end]) { dp[mask][end] = candidate; parent[mask][end] = prev; }
      }
    }
    let end = 0;
    for (let i = 1; i < count; i++) if (dp[size - 1][i] + (roundTrip ? cost[i + 1][0] : 0) < dp[size - 1][end] + (roundTrip ? cost[end + 1][0] : 0)) end = i;
    const path: number[] = []; let mask = size - 1;
    while (end >= 0) { path.push(end + 1); const previous = parent[mask][end]; mask ^= 1 << end; end = previous; }
    return path.reverse();
  }
  const remaining = new Set(Array.from({ length: count }, (_, i) => i + 1));
  let path: number[] = [], cursor = 0;
  while (remaining.size) { const next = [...remaining].sort((a, b) => cost[cursor][a] - cost[cursor][b])[0]; path.push(next); remaining.delete(next); cursor = next; }
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let i = 0; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const candidate = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
      if (pathCost(candidate) + .01 < pathCost(path)) { path = candidate; improved = true; }
    }
    if (!improved) break;
  }
  return path;
}

export async function calculateRoadRoute(points: RoadPoint[], roundTrip: boolean, signal: AbortSignal): Promise<RoadResult> {
  if (points.length > 31) throw new Error('Selecione até 30 paradas por percurso.');
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=duration`, { signal });
  if (!response.ok) throw new Error('O serviço de rotas está indisponível. Tente novamente.');
  const table = await response.json() as { code?: string; durations?: number[][] };
  if (table.code !== 'Ok' || !Array.isArray(table.durations) || table.durations.length !== points.length || table.durations.some((row: unknown[]) => row.some((n) => typeof n !== 'number'))) throw new Error('Não foi possível conectar os locais por estrada. Confira as coordenadas ou tente novamente.');
  const order = optimizeOrder(table.durations, roundTrip);
  const ordered = [0, ...order, ...(roundTrip ? [0] : [])].map((i) => points[i]);
  const routeResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${ordered.map((point) => `${point.lng},${point.lat}`).join(';')}?overview=full&geometries=geojson`, { signal });
  const data = await routeResponse.json() as { code?: string; routes?: Array<{ legs: Array<{ duration: number; distance: number }>; geometry: { coordinates: number[][] } }> };
  if (!routeResponse.ok || data.code !== 'Ok' || !data.routes?.[0]?.legs) throw new Error('Não foi possível desenhar o percurso. Tente novamente.');
  const route = data.routes[0];
  return { order, legs: route.legs.map((leg: { duration: number; distance: number }) => ({ seconds: leg.duration, meters: leg.distance })), coordinates: route.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng]), exact: order.length <= 12 };
}
