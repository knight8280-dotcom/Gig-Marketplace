import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsISO31661Alpha2,
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

export class CreateJobDto {
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsUUID()
  category_id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  address_line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address_line2?: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(100)
  region!: string;

  @IsString()
  @MaxLength(20)
  postal_code!: string;

  @IsOptional()
  @IsISO31661Alpha2()
  country?: string;

  @ValidateNested()
  @Type(() => LatLngDto)
  location!: LatLngDto;

  /** IANA timezone of the job site. */
  @Matches(/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/)
  timezone!: string;

  @IsIn(['SCHEDULED', 'SAME_DAY', 'ASAP'])
  urgency!: 'SCHEDULED' | 'SAME_DAY' | 'ASAP';

  @IsOptional()
  @IsISO8601()
  scheduled_start_at?: string;

  @IsInt()
  @Min(15)
  @Max(1440)
  estimated_duration_minutes!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  workers_needed!: number;

  @IsIn(['FLAT', 'HOURLY'])
  pay_type!: 'FLAT' | 'HOURLY';

  /** FLAT: total per worker; HOURLY: rate/hour per worker. Integer cents. */
  @IsInt()
  @Min(100)
  @Max(100_000_00)
  pay_cents!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMaxSize(20)
  required_equipment?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  physical_requirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  special_instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  access_instructions?: string;

  /** true → save as draft; false/absent → post immediately. */
  @IsOptional()
  @IsBoolean()
  save_as_draft?: boolean;
}

export class CancelJobDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** Client must show policy consequences before the user confirms. */
  @IsBoolean()
  acknowledged_consequences!: boolean;
}

export class CancelAssignmentDto {
  @IsIn(['CHANGED_PLANS', 'JOB_MISREPRESENTED', 'SAFETY', 'OTHER'])
  reason!: 'CHANGED_PLANS' | 'JOB_MISREPRESENTED' | 'SAFETY' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}

export class ArrivedDto {
  /** Optional GPS evidence — never sole proof of arrival. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  location?: LatLngDto;
}

export class ProposeChangeDto {
  /** Subset of mutable-by-agreement fields with new values. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100_000_00)
  pay_cents?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  estimated_duration_minutes?: number;

  @IsOptional()
  @IsISO8601()
  scheduled_start_at?: string;
}

export class DiscoveryQueryDto {
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(160934)
  radius_m?: number;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_pay_cents?: number;

  @IsOptional()
  @IsISO8601()
  start_after?: string;

  @IsOptional()
  @IsISO8601()
  start_before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
