import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return this.settings.getMasked();
  }

  @Post('validate')
  async validate() {
    return this.settings.validate();
  }
}
