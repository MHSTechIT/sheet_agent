import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentUser } from './current-user.decorator';

class LoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;
  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.auth.login(body.password, body.email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { id: string; email: string }) {
    return user;
  }
}
