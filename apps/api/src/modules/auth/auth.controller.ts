import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, RequestUser } from '../../common/auth.decorators';
import { AuthService, TokenPair } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  PhoneConfirmDto,
  PhoneRequestDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';

interface AuthResponse {
  user: { id: string; email: string; roles: string[] };
  tokens: TokenPair;
}

/** Strict limits on credential endpoints (SECURITY_MODEL / rate-limit classes). */
const AUTH_STRICT = { default: { limit: 10, ttl: 15 * 60 * 1000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_STRICT)
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.register(dto.email, dto.password, dto.role);
    return { user: { id: user.id, email: user.email, roles: user.roles }, tokens };
  }

  @Public()
  @Throttle(AUTH_STRICT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.login(dto.email, dto.password);
    return { user: { id: user.id, email: user.email, roles: user.roles }, tokens };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refresh_token);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refresh_token);
  }

  @Public()
  @Throttle(AUTH_STRICT)
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ verified: true }> {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @HttpCode(204)
  @Post('phone/request')
  async phoneRequest(@CurrentUser() user: RequestUser, @Body() dto: PhoneRequestDto): Promise<void> {
    await this.auth.requestPhoneCode(user.id, dto.phone);
  }

  @Throttle(AUTH_STRICT)
  @HttpCode(200)
  @Post('phone/confirm')
  async phoneConfirm(
    @CurrentUser() user: RequestUser,
    @Body() dto: PhoneConfirmDto,
  ): Promise<{ verified: true }> {
    await this.auth.confirmPhone(user.id, dto.phone, dto.code);
    return { verified: true };
  }

  @Public()
  @Throttle(AUTH_STRICT)
  @HttpCode(200)
  @Post('password/forgot')
  async forgot(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.auth.forgotPassword(dto.email);
    return { ok: true }; // Always 200 — no account enumeration.
  }

  @Public()
  @Throttle(AUTH_STRICT)
  @HttpCode(200)
  @Post('password/reset')
  async reset(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto.token, dto.new_password);
    return { ok: true };
  }
}
