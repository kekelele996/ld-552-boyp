import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DataScopeInterceptor } from './interceptors/data-scope.interceptor';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { OffersModule } from './modules/offers/offers.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthController } from './health.controller';

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'talentflow-secret' }), AuthModule, JobsModule, CandidatesModule, ResumesModule, InterviewsModule, OffersModule, AuditModule],
  controllers: [HealthController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }, { provide: APP_INTERCEPTOR, useClass: DataScopeInterceptor }, { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }],
})
export class AppModule {}
