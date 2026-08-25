import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentUser, RequestUser, RequirePermissions } from '../../common/auth.decorators';
import { DomainError } from '../../common/errors';
import { CustomersRepository } from './customers.repository';
import { CreateAddressDto, UpsertCustomerProfileDto } from './dto';

@Controller('me')
export class CustomersController {
  constructor(private readonly customers: CustomersRepository) {}

  @Get('customer-profile')
  async getProfile(@CurrentUser() user: RequestUser) {
    const profile = await this.customers.findProfile(user.id);
    if (!profile) throw DomainError.notFound('No customer profile yet');
    return profile;
  }

  @RequirePermissions('customer_profile:write')
  @Put('customer-profile')
  upsertProfile(@CurrentUser() user: RequestUser, @Body() dto: UpsertCustomerProfileDto) {
    return this.customers.upsertProfile(user.id, dto);
  }

  @Get('addresses')
  async listAddresses(@CurrentUser() user: RequestUser) {
    return { items: await this.customers.listAddresses(user.id) };
  }

  @RequirePermissions('customer_profile:write')
  @Post('addresses')
  createAddress(@CurrentUser() user: RequestUser, @Body() dto: CreateAddressDto) {
    return this.customers.createAddress(user.id, dto);
  }

  @RequirePermissions('customer_profile:write')
  @HttpCode(204)
  @Delete('addresses/:id')
  async deleteAddress(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const deleted = await this.customers.deleteAddress(user.id, id);
    if (!deleted) throw DomainError.notFound('Address not found');
  }
}
