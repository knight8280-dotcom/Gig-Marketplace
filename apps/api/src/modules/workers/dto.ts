import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LatLngDto } from '../../common/geo';

const TRANSPORTS = ['NONE', 'BICYCLE', 'CAR', 'TRUCK', 'VAN'] as const;

export class UpsertWorkerProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  experience?: string;

  @IsOptional()
  @IsArray()
  @IsIn(TRANSPORTS, { each: true })
  transportation?: (typeof TRANSPORTS)[number][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMaxSize(50)
  equipment?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(20)
  languages?: string[];

  /** Meters; bounds mirror the DB CHECK (500 m – 100 mi). */
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(160934)
  service_radius_m?: number;

  /** Private home base for matching — never exposed via any API. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  home_location?: LatLngDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_pay_cents?: number;
}

export class SetSkillsDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(100)
  skill_ids!: string[];
}

export class SetCategoriesDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(50)
  category_ids!: string[];
}

export class AvailabilityWindowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  start_minute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  end_minute!: number;

  /** IANA timezone, e.g. America/Chicago (single tokens like UTC also valid). */
  @Matches(/^[A-Za-z_]+(?:[+-]?[0-9]+)?(?:\/[A-Za-z0-9_+\-]+){0,2}$/)
  timezone!: string;
}

export class SetAvailabilityDto {
  @IsBoolean()
  available_now!: boolean;

  @IsOptional()
  @IsISO8601()
  available_until?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  @ArrayMaxSize(28)
  windows!: AvailabilityWindowDto[];
}

export class AcceptAgreementDto {
  @IsIn(['TERMS_OF_SERVICE', 'WORKER_SAFETY'])
  agreement!: 'TERMS_OF_SERVICE' | 'WORKER_SAFETY';

  @IsString()
  @MaxLength(20)
  version!: string;
}
