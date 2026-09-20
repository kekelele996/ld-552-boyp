import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PrismaService } from '../../prisma/prisma.service';
@Module({ controllers: [OffersController], providers: [OffersService, PrismaService] })
export class OffersModule {}
