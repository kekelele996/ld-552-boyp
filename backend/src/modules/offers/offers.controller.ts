import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../decorators/roles.decorator';
import { OfferStatus, UserRole } from '../../constants/enums';
import { OffersService } from './offers.service';
@Controller('offers')
export class OffersController {
  constructor(private offers: OffersService) {}
  @Post() @Roles(UserRole.HR, UserRole.ADMIN) create(@Body() body: any) { return this.offers.create(body); }
  @Patch(':id/status') @Roles(UserRole.HR, UserRole.HIRING_MANAGER, UserRole.ADMIN) status(@Param('id') id: string, @Body() body: { status: OfferStatus; reason?: string }) { return this.offers.updateStatus(+id, body.status, body.reason); }
}
