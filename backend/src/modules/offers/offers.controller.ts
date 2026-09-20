import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { OfferStatus, UserRole } from '../../constants/enums';
import { OffersService } from './offers.service';

@Controller('offers')
export class OffersController {
  constructor(private offers: OffersService) {}

  @Post()
  @Roles(UserRole.HR, UserRole.ADMIN)
  create(@Body() body: any) {
    return this.offers.create(body);
  }

  // 具体流转所需角色由 OffersService 按动作校验（审批仅本部门招聘经理/管理员）
  @Patch(':id/status')
  @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN)
  status(@Param('id') id: string, @Body() body: { status: OfferStatus; reason?: string }, @Req() req: any) {
    return this.offers.updateStatus(+id, body.status, body.reason, req.user, req.ip);
  }
}
