import type { Harvest, HarvestSnapshot } from '../domain/types';
import { readJson, writeStorageBatch, type StorageUpdates } from './storage';

/** One commit for map data, operational records, schedule and harvest metadata. */
export function saveHarvestBundle(id: string, snapshot: HarvestSnapshot, harvests: Harvest[], extra: StorageUpdates = {}) {
  const previous = readJson<Record<string, HarvestSnapshot>>('field-wheat-harvest-data-v2', {});
  const ratings = snapshot.activities.filter((activity) => typeof activity.qualityScore === 'number');
  const quality = ratings.length ? Math.round(ratings.reduce((sum, activity) => sum + activity.qualityScore!, 0) / ratings.length) : 0;
  const nextHarvests = harvests.map((harvest) => harvest.id === id ? { ...harvest, quality, updatedAt: snapshot.updatedAt } : harvest);
  writeStorageBatch({
    ...extra,
    'field-wheat-locations-clean-v1': JSON.stringify(snapshot.locations),
    'field-wheat-imported-trials-clean-v1': JSON.stringify(snapshot.trials),
    'field-wheat-trials-clean-v1': '[]',
    'field-wheat-schedule-clean-v1': JSON.stringify(snapshot.schedule),
    'field-wheat-activities-clean-v1': JSON.stringify(snapshot.activities),
    'field-wheat-unified-source-v1': JSON.stringify(snapshot.source),
    'field-wheat-harvest-data-v2': JSON.stringify({ ...previous, [id]: snapshot }),
    'field-wheat-harvests-v2': JSON.stringify(nextHarvests),
    'field-wheat-last-update-v2': snapshot.updatedAt,
  });
  return nextHarvests;
}
