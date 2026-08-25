import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateAddressDto, UpsertCustomerProfileDto } from './dto';

export interface CustomerProfileRow {
  user_id: string;
  display_name: string;
  business_name: string | null;
  business_info: Record<string, unknown> | null;
  rating_avg: string | null;
  rating_count: number;
  jobs_completed: number;
  created_at: Date;
}

export interface AddressRow {
  id: string;
  user_id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
  access_notes: string | null;
}

const ADDRESS_SELECT = `
  id, user_id, label, address_line1, address_line2, city, region, postal_code, country,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, access_notes`;

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findProfile(userId: string): Promise<CustomerProfileRow | null> {
    const { rows } = await this.db.query<CustomerProfileRow>(
      'SELECT * FROM customer_profiles WHERE user_id = $1',
      [userId],
    );
    return rows[0] ?? null;
  }

  async upsertProfile(userId: string, dto: UpsertCustomerProfileDto): Promise<CustomerProfileRow> {
    const { rows } = await this.db.query<CustomerProfileRow>(
      `INSERT INTO customer_profiles (user_id, display_name, business_name, business_info)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         business_name = EXCLUDED.business_name,
         business_info = EXCLUDED.business_info,
         updated_at = now()
       RETURNING *`,
      [userId, dto.display_name, dto.business_name ?? null, dto.business_info ?? null],
    );
    return rows[0]!;
  }

  async listAddresses(userId: string): Promise<AddressRow[]> {
    const { rows } = await this.db.query<AddressRow>(
      `SELECT ${ADDRESS_SELECT} FROM saved_addresses
       WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [userId],
    );
    return rows;
  }

  async createAddress(userId: string, dto: CreateAddressDto): Promise<AddressRow> {
    const { rows } = await this.db.query<AddressRow>(
      `INSERT INTO saved_addresses
         (user_id, label, address_line1, address_line2, city, region, postal_code, country, location, access_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography, $11)
       RETURNING ${ADDRESS_SELECT}`,
      [
        userId,
        dto.label,
        dto.address_line1,
        dto.address_line2 ?? null,
        dto.city,
        dto.region,
        dto.postal_code,
        dto.country ?? 'US',
        dto.location.lng,
        dto.location.lat,
        dto.access_notes ?? null,
      ],
    );
    return rows[0]!;
  }

  /** Ownership enforced in the WHERE clause — no cross-user access possible. */
  async deleteAddress(userId: string, addressId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE saved_addresses SET deleted_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [addressId, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
