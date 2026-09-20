import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '../../constants/enums';
import { InterviewsService } from './interviews.service';
@Controller('interviews')
export class InterviewsController {
  constructor(private interviews: InterviewsService) {}
  @Get() findAll(@Query() q: any, @Req() req: any) { return this.interviews.findAll(q, req); }
  @Post() @Roles(UserRole.HR, UserRole.ADMIN) create(@Body() body: any) { return this.interviews.create(body); }
  @Patch(':id') @Roles(UserRole.HR, UserRole.INTERVIEWER, UserRole.ADMIN) update(@Param('id') id: string, @Body() body: any) { return this.interviews.update(+id, body); }
}
