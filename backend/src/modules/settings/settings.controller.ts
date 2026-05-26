import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SettingsService } from './settings.service';

class SaveSettingsDto {
  @IsString() metaSystemToken!: string;
  @IsString() metaAppId!: string;
  @IsString() metaAppSecret!: string;
  @IsString() metaPageId!: string;
  @IsString() metaAdAccountId!: string;
  @IsString() googleClientId!: string;
  @IsString() googleClientSecret!: string;
  @IsString() googleRefreshToken!: string;
  @IsString() watiApiEndpoint!: string;
  @IsString() watiAccessToken!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return (await this.settings.getMasked()) ?? { hasSettings: false };
  }

  @Post()
  async save(@Body() body: SaveSettingsDto) {
    return this.settings.save(body);
  }

  @Post('validate')
  async validate() {
    return this.settings.validate();
  }
}
