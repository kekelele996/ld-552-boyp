import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { JobStatus, UserRole } from '../../constants/enums';
import { JobsService } from './jobs.service';
@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}
  @Get() findAll(@Query() q: any, @Req() req: any) { return this.jobs.findAll(q, req.user); }
  @Post() @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN) create(@Body() body: any) { return this.jobs.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.jobs.findOne(+id); }
  @Patch(':id') @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN) update(@Param('id') id: string, @Body() body: any) { return this.jobs.update(+id, body); }
  @Patch(':id/status') @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN) status(@Param('id') id: string, @Body() body: { status: JobStatus; reason?: string }) { return this.jobs.updateStatus(+id, body.status, body.reason); }
  @Get(':id/resumes') resumes(@Param('id') id: string) { return this.jobs.resumes(+id); }
  @Get(':id/interviews') interviews(@Param('id') id: string) { return this.jobs.interviews(+id); }
}
