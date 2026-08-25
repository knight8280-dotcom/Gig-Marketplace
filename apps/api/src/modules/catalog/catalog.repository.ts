import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  enabled: boolean;
  min_worker_age: number | null;
  requires_identity_verification: boolean;
  requires_background_check: boolean;
  requires_insurance: boolean;
  requires_disclosures: boolean;
  disclosure_text: string | null;
  max_duration_minutes: number | null;
  safety_notes: string | null;
  required_equipment: string[];
  sort_order: number;
}

export interface SkillRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

@Injectable()
export class CatalogRepository {
  constructor(private readonly db: DatabaseService) {}

  async listEnabledCategories(): Promise<CategoryRow[]> {
    const { rows } = await this.db.query<CategoryRow>(
      'SELECT * FROM categories WHERE enabled ORDER BY sort_order, name',
    );
    return rows;
  }

  async listAllCategories(): Promise<CategoryRow[]> {
    const { rows } = await this.db.query<CategoryRow>(
      'SELECT * FROM categories ORDER BY sort_order, name',
    );
    return rows;
  }

  async findCategory(id: string): Promise<CategoryRow | null> {
    const { rows } = await this.db.query<CategoryRow>('SELECT * FROM categories WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async createCategory(data: Partial<CategoryRow> & { slug: string; name: string }): Promise<CategoryRow> {
    const { rows } = await this.db.query<CategoryRow>(
      `INSERT INTO categories
         (slug, name, description, icon, enabled, min_worker_age,
          requires_identity_verification, requires_background_check, requires_insurance,
          requires_disclosures, disclosure_text, max_duration_minutes, safety_notes,
          required_equipment, sort_order)
       VALUES ($1,$2,COALESCE($3,''),$4,COALESCE($5::boolean,false),$6,
               COALESCE($7::boolean,false),COALESCE($8::boolean,false),COALESCE($9::boolean,false),
               COALESCE($10::boolean,false),$11,$12,$13,COALESCE($14::text[],'{}'::text[]),COALESCE($15::int,0))
       RETURNING *`,
      [
        data.slug,
        data.name,
        data.description,
        data.icon ?? null,
        data.enabled,
        data.min_worker_age ?? null,
        data.requires_identity_verification,
        data.requires_background_check,
        data.requires_insurance,
        data.requires_disclosures,
        data.disclosure_text ?? null,
        data.max_duration_minutes ?? null,
        data.safety_notes ?? null,
        data.required_equipment,
        data.sort_order,
      ],
    );
    return rows[0]!;
  }

  async updateCategory(id: string, patch: Partial<CategoryRow>): Promise<CategoryRow | null> {
    const { rows } = await this.db.query<CategoryRow>(
      `UPDATE categories SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         icon = COALESCE($4, icon),
         enabled = COALESCE($5, enabled),
         min_worker_age = COALESCE($6, min_worker_age),
         requires_identity_verification = COALESCE($7, requires_identity_verification),
         requires_background_check = COALESCE($8, requires_background_check),
         requires_insurance = COALESCE($9, requires_insurance),
         requires_disclosures = COALESCE($10, requires_disclosures),
         disclosure_text = COALESCE($11, disclosure_text),
         max_duration_minutes = COALESCE($12, max_duration_minutes),
         safety_notes = COALESCE($13, safety_notes),
         required_equipment = COALESCE($14, required_equipment),
         sort_order = COALESCE($15, sort_order),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.icon ?? null,
        patch.enabled ?? null,
        patch.min_worker_age ?? null,
        patch.requires_identity_verification ?? null,
        patch.requires_background_check ?? null,
        patch.requires_insurance ?? null,
        patch.requires_disclosures ?? null,
        patch.disclosure_text ?? null,
        patch.max_duration_minutes ?? null,
        patch.safety_notes ?? null,
        patch.required_equipment ?? null,
        patch.sort_order ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async listSkills(activeOnly: boolean): Promise<SkillRow[]> {
    const { rows } = await this.db.query<SkillRow>(
      activeOnly
        ? 'SELECT * FROM skills WHERE active ORDER BY name'
        : 'SELECT * FROM skills ORDER BY name',
    );
    return rows;
  }

  async createSkill(slug: string, name: string): Promise<SkillRow> {
    const { rows } = await this.db.query<SkillRow>(
      'INSERT INTO skills (slug, name) VALUES ($1, $2) RETURNING *',
      [slug, name],
    );
    return rows[0]!;
  }
}
