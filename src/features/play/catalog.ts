import { useEffect, useState } from 'react';
import { samplePlaces } from '../../demo/places';
import { isUiDemo } from '../../demo/mode';
import type { Place, PlacePage, PlaceProvider, PlaceQuery } from './places';

export function discoveryCatalog(): Place[] {
  return isUiDemo ? samplePlaces : [];
}

export function createLocalPlaceProvider(source: readonly Place[], id: string): PlaceProvider {
  return {
    id,
    cacheTtlMs: 60_000,
    async search({ city, category, keyword, cursor, limit = 24 }) {
      const term = keyword?.trim().toLowerCase();
      const results = source.filter((place) => (!city || city === place.city)
        && (!category || category === place.category)
        && (!term || [place.title, place.district, place.address, place.intro].some((value) => value?.toLowerCase().includes(term))));
      const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
      const end = offset + (Number.isInteger(limit) ? Math.min(50, Math.max(1, limit)) : 24);
      return { places: results.slice(offset, end), next: end < results.length ? String(end) : null };
    },
    async detail(id) {
      return source.find((place) => place.id === id);
    },
  };
}

export function createPlaceCatalog(provider: PlaceProvider) {
  const cached = new Map<string, { value: PlacePage | Place; until: number }>();
  async function load<T extends PlacePage | Place>(key: string, fetch: () => Promise<T | undefined>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const previous = cached.get(key);
    if (previous && previous.until > Date.now()) return previous.value as T;
    const value = await fetch();
    signal?.throwIfAborted();
    if (value && provider.cacheTtlMs > 0) {
      if (cached.size >= 40) cached.delete(cached.keys().next().value!);
      cached.set(key, { value, until: Date.now() + provider.cacheTtlMs });
    }
    return value;
  }
  return {
    search(query: PlaceQuery, signal?: AbortSignal) {
      return load(provider.id + ':search:' + JSON.stringify(query), () => provider.search(query, signal), signal);
    },
    detail(id: string, signal?: AbortSignal) {
      return load(provider.id + ':detail:' + id, () => provider.detail(id, signal), signal);
    },
  };
}

const catalog = createPlaceCatalog(createLocalPlaceProvider(discoveryCatalog(), 'local'));

export function usePlaces(city: PlaceQuery['city'], category: PlaceQuery['category']) {
  const [page, setPage] = useState<PlacePage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setPage(undefined);
    setLoading(true);
    setError(false);
    void catalog.search({ city, category }, abort.signal).then((value) => setPage(value))
      .catch(() => { if (!abort.signal.aborted) setError(true); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [city, category]);
  return { places: page?.places ?? [], loading, error };
}

export function usePlace(id: string) {
  const [result, setResult] = useState<{ id: string; place?: Place }>();
  useEffect(() => {
    const abort = new AbortController();
    void catalog.detail(id, abort.signal).then((place) => setResult({ id, place }))
      .catch(() => { if (!abort.signal.aborted) setResult({ id }); });
    return () => abort.abort();
  }, [id]);
  return result?.id === id ? { place: result.place, loading: false } : { place: undefined, loading: true };
}
