import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role, department: user.department }, { secret: process.env.JWT_SECRET || 'talentflow-secret' });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department } };
  }
}
