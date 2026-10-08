# Loop Overture Places — Phase 1 pilot

**Status:** Schema installed in the Loop Supabase project. Search API integrates it as the primary provider, with the pre-existing source-backed directory, OSM, and optional Google Places as fallbacks. **No Overture records are imported automatically.** First import requires operator review and secure credentials.

## Architecture

1. Overture's official Places GeoParquet data (latest catalog release) provides the independent base place index. Its feature IDs anchor a place across refreshes.
2. A manually started GitHub Actions workflow downloads **one** South Florida region as GeoJSONSeq, validates input and safety limits, then upserts records into `public.loop_place_index` via server-side credentials.
3. `loop_search_index` uses PostGIS distance filtering and taxonomy/name keywords. Client UI never receives an Overture API key or Supabase service credentials.
4. `/api/places` searches Loop's own index first. Until ingestion is completed, it preserves existing search fallbacks; later providers may still fill gaps.
5. Loop reviews, recommendations, and reputation remain separate from third-party place data.

## Database and credentials

- `supabase-loop-places.sql` has already been applied to the linked Supabase project. The table is RLS-protected, not directly available to anonymous/registered users.
- Vercel production should have `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as **server-only environment variables**, as used by Loop's existing feedback/reputation services. Never expose the secret in the public UI.
- For the **manual importer only**, configure GitHub repository **Settings → Secrets and variables → Actions** with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the Supabase server secret key/service-role key). They are not required for dry runs.
- Use the official Supabase dashboard or approved secret-management controls. Never paste keys into an issue, commit, conversation, or client-side script.

## First South Florida import

1. Open **Actions → Import Overture places (manual) → Run workflow**.
2. Choose `broward`; leave **dry_run = true** for the first test.
3. Inspect the accepted count, selected Overture release, and workflow logs.
4. If count exceeds the 30,000-record guard, **do not bypass the guard blindly**. Split the bounding box or narrow coverage after reviewing expected storage size.
5. Configure importer secrets, set **dry_run = false**, and run again when ready to load.
6. Repeat for `miami_dade` and `palm_beach` after checking browser search relevance and database usage.

Regional bounds, listed west/south/east/north:
- Broward: `-80.53,25.94,-80.04,26.42`
- Miami-Dade: `-80.90,25.35,-80.06,25.99`
- Palm Beach: `-80.80,26.35,-79.95,27.06`

The importer skips places marked permanently closed, without usable names/IDs/coordinates, below the minimum confidence threshold (0.55), or outside the requested region. It fails safely before writing if a batch would exceed its configured record cap. Imports use stable Overture IDs for idempotent upserts.

## Verify after importing

Run a read-only query in Supabase:

```sql
select count(*) as places, min(source_release) as oldest_release,
       max(source_release) as newest_release
from public.loop_place_index;

select * from public.loop_search_index(
  26.155, -80.28, 30, array['haitian'], 20
);
```

Test category searches for `restaurant`, `pizza`, `car_repair`, `park`, etc. **Do not interpret a zero-result Haitian search as a guarantee that no Haitian business exists:** Overture does not uniformly classify cuisines, and a fallback search provider may still be necessary.

## Known limitations / next phase

- This is not yet a nationwide or continuously refreshed index. Imports are opt-in and scoped by region.
- Overture's place *existence confidence* is not a customer rating or proof of operating hours.
- Merge/conflation of equivalent Overture, OSM, provider, and Loop user-created places needs future work; source IDs are retained.
- Need to add periodic release refresh, data-deletion/stale-record policy, provider-based quality metrics, duplicate handling, and licensed fresh-data fallback before expansion.
- Overture Places licenses vary by source, including CDLA Permissive 2.0 and Apache 2.0; preserve attribution and inspect the [Overture attribution guide](https://docs.overturemaps.org/attribution/). OSM's attribution and licensing obligations remain separate.

Official Overture docs:
- https://docs.overturemaps.org/guides/places/
- https://docs.overturemaps.org/getting-data/overturemaps-py/
- https://docs.overturemaps.org/schema/reference/places/place/
