import { Body, Controller, HttpCode, Inject, Injectable, Logger, Module, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { DomainError } from '../../common/errors';

/**
 * Forward geocoding behind a provider adapter (resolves OD-1 for the pilot):
 *  - nominatim (default): OpenStreetMap's public endpoint — keyless, rate-limited
 *    (fine for pilot volume; usage policy requires a proper User-Agent).
 *  - stub: explicit failure for tests/offline dev — never fake coordinates.
 * Google/Mapbox slot in behind the same interface when volume justifies it.
 */
export interface Geocoder {
  geocode(query: string): Promise<{ lat: number; lng: number; display_name: string } | null>;
}

export const GEOCODER = 'GEOCODER';

@Injectable()
export class NominatimGeocoder implements Geocoder {
  private readonly logger = new Logger(NominatimGeocoder.name);

  async geocode(query: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'local-gig-marketplace-dev/0.1 (pilot prototype)' },
    });
    if (!res.ok) {
      this.logger.warn(`Nominatim responded ${res.status}`);
      return null;
    }
    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const hit = results[0];
    if (!hit) return null;
    return { lat: Number(hit.lat), lng: Number(hit.lon), display_name: hit.display_name };
  }
}

@Injectable()
export class StubGeocoder implements Geocoder {
  async geocode(): Promise<null> {
    return null; // Honest "unavailable" — callers fall back to device/pin coords.
  }
}

class GeocodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(300)
  query!: string;
}

@Controller('geo')
class GeoController {
  constructor(@Inject(GEOCODER) private readonly geocoder: Geocoder) {}

  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  @HttpCode(200)
  @Post('geocode')
  async geocode(@Body() dto: GeocodeDto) {
    const result = await this.geocoder.geocode(dto.query);
    if (!result) throw DomainError.notFound('No match for that address');
    return result;
  }
}

@Module({
  controllers: [GeoController],
  providers: [
    {
      provide: GEOCODER,
      useClass: (process.env.GEOCODER_PROVIDER ?? 'nominatim') === 'stub' ? StubGeocoder : NominatimGeocoder,
    },
  ],
})
export class GeoModule {}
