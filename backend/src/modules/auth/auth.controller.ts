import { Body, Controller, Post } from '@nestjs/common';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) { return this.auth.login(body.email, body.password); }
}
