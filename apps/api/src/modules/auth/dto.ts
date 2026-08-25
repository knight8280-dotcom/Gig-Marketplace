import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(200)
  password!: string;

  /** Which side of the marketplace the user is signing up for (can add the other later). */
  @IsIn(['CUSTOMER', 'WORKER'])
  role!: 'CUSTOMER' | 'WORKER';
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refresh_token!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class PhoneRequestDto {
  /** E.164, e.g. +15551234567 */
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be in E.164 format' })
  phone!: string;
}

export class PhoneConfirmDto {
  /** E.164 — must match the number the code was sent to. */
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be in E.164 format' })
  phone!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  new_password!: string;
}
