import { Controller, Get, Param, Query } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
@Controller('candidates')
export class CandidatesController {
  constructor(private candidates: CandidatesService) {}
  @Get() findAll(@Query() q: any) { return this.candidates.findAll(q); }
  @Get(':id') findOne(@Param('id') id: string) { return this.candidates.findOne(+id); }
  @Get(':id/resumes') resumes(@Param('id') id: string) { return this.candidates.resumes(+id); }
  @Get(':id/interviews') interviews(@Param('id') id: string) { return this.candidates.interviews(+id); }
  @Get(':id/offers') offers(@Param('id') id: string) { return this.candidates.offers(+id); }
}
