import { Module } from '@nestjs/common';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { PrismaService } from '../../prisma/prisma.service';
@Module({ controllers: [ResumesController], providers: [ResumesService, PrismaService] })
export class ResumesModule {}
