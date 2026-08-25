import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Public, CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { CatalogRepository } from './catalog.repository';
import { AuthService } from '../auth/auth.service';

class CreateCategoryDto {
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(60)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(14)
  min_worker_age?: number;

  @IsOptional()
  @IsBoolean()
  requires_identity_verification?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_background_check?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_insurance?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(14)
  min_worker_age?: number;

  @IsOptional()
  @IsBoolean()
  requires_identity_verification?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_background_check?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_insurance?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

class CreateSkillDto {
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(60)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

/** Public catalog reads — clients need these before authentication (signup flows). */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogRepository) {}

  @Public()
  @Get('categories')
  async categories() {
    return { items: await this.catalog.listEnabledCategories() };
  }

  @Public()
  @Get('skills')
  async skills() {
    return { items: await this.catalog.listSkills(true) };
  }
}

/** Admin catalog management — every mutation audited. */
@RequirePermissions('admin:access')
@Controller('admin')
export class CatalogAdminController {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly auth: AuthService,
  ) {}

  @Get('categories')
  async allCategories() {
    return { items: await this.catalog.listAllCategories() };
  }

  @Post('categories')
  async createCategory(@CurrentUser() admin: RequestUser, @Body() dto: CreateCategoryDto) {
    const category = await this.catalog.createCategory(dto);
    await this.auth.audit(admin.id, 'admin.category_created', 'categories', category.id);
    return category;
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const updated = await this.catalog.updateCategory(id, dto);
    if (!updated) throw DomainError.notFound('Category not found');
    await this.auth.audit(admin.id, 'admin.category_updated', 'categories', id);
    return updated;
  }

  @Get('skills')
  async allSkills() {
    return { items: await this.catalog.listSkills(false) };
  }

  @Post('skills')
  async createSkill(@CurrentUser() admin: RequestUser, @Body() dto: CreateSkillDto) {
    const skill = await this.catalog.createSkill(dto.slug, dto.name);
    await this.auth.audit(admin.id, 'admin.skill_created', 'skills', skill.id);
    return skill;
  }
}
