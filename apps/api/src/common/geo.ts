import { IsLatitude, IsLongitude } from 'class-validator';

/**
 * Locations arrive from clients as explicit coordinates (map-pin UX) plus
 * address fields. Server-side geocoding via a real provider is tracked as
 * OD-1 in DECISIONS.md — there is intentionally no fake geocoder.
 */
export class LatLngDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

/** SQL fragment builders — always used with parameterized lng/lat values. */
export const GEOGRAPHY_POINT_SQL = (lngParam: string, latParam: string): string =>
  `ST_SetSRID(ST_MakePoint(${lngParam}, ${latParam}), 4326)::geography`;
