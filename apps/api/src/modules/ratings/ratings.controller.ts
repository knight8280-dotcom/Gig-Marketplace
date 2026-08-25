import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/auth.decorators';
import { RatingsService } from './ratings.service';

class SubmitRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overall!: number;

  @IsOptional() @IsInt() @Min(1) @Max(5) reliability?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) communication?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) professionalism?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) accuracy?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post('assignments/:id/rating')
  submit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.ratings.submit(user, id, dto);
  }

  @Get('me/ratings')
  async received(@CurrentUser() user: RequestUser) {
    return { items: await this.ratings.listReceived(user) };
  }

  @Get('me/ratings/pending')
  async pending(@CurrentUser() user: RequestUser) {
    return { items: await this.ratings.listPending(user) };
  }
}
