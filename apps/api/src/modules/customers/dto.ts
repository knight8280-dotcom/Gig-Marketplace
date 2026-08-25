import { Type } from 'class-transformer';
import {
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LatLngDto } from '../../common/geo';

export class UpsertCustomerProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  business_name?: string;

  @IsOptional()
  @IsObject()
  business_info?: Record<string, unknown>;
}

export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  access_notes?: string;
}
