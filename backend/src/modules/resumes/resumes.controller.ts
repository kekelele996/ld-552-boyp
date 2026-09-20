import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { ResumeStatus, UserRole } from '../../constants/enums';
import { ResumesService } from './resumes.service';
@Controller('resumes')
export class ResumesController {
  constructor(private resumes: ResumesService) {}
  @Post() @Roles(UserRole.HR, UserRole.ADMIN) create(@Body() body: any) { return this.resumes.create(body); }
  @Patch(':id/status') @Roles(UserRole.HR, UserRole.ADMIN) status(@Param('id') id: string, @Body() body: { status: ResumeStatus; reason?: string }) { return this.resumes.updateStatus(+id, body.status, body.reason); }
}
