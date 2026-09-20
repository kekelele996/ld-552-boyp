import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '../constants/enums';

@Injectable()
export class DataScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    request.dataScope = {
      interviewerId: user?.role === UserRole.INTERVIEWER ? user.sub : undefined,
      department: user?.role === UserRole.HIRING_MANAGER ? user.department : undefined,
    };
    return next.handle();
  }
}
