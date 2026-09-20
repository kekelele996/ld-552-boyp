import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '../../constants/enums';
import { AuditService } from './audit.service';
@Controller('audit-logs')
@Roles(UserRole.ADMIN)
export class AuditController { constructor(private audit: AuditService) {} @Get() all() { return this.audit.all(); } @Get('candidate/:id') candidate(@Param('id') id: string) { return this.audit.candidate(+id); } }
