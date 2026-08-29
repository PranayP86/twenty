import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { ApiPath } from 'twenty-shared/types';

import { AssignAnansiManagedRoleInput } from 'src/engine/core-modules/auth/dto/assign-anansi-managed-role.input';
import { AnansiInternalAuthGuard } from 'src/engine/core-modules/auth/guards/anansi-internal-auth.guard';
import { AnansiManagedRoleService } from 'src/engine/metadata-modules/role/services/anansi-managed-role.service';

@Controller(`${ApiPath.Auth}/anansi`)
@UseGuards(AnansiInternalAuthGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    exceptionFactory: () =>
      new HttpException(
        { message: 'Invalid request', statusCode: HttpStatus.BAD_REQUEST },
        HttpStatus.BAD_REQUEST,
      ),
  }),
)
export class AnansiManagedRoleController {
  constructor(
    private readonly anansiManagedRoleService: AnansiManagedRoleService,
  ) {}

  // This endpoint uses its dedicated constant-time shared-secret guard rather
  // than Twenty's user/workspace and role-permission guards.
  // oxlint-disable-next-line twenty/rest-api-methods-should-be-guarded
  @Post('managed-role')
  @HttpCode(HttpStatus.OK)
  async assignManagedRole(@Body() input: AssignAnansiManagedRoleInput) {
    return this.anansiManagedRoleService.assignManagedMemberRole(input);
  }
}
