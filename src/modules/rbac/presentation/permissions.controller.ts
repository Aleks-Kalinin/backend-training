import { AuthGuard } from '@/modules/auth/auth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from '../application/permissions.service';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { PermissionResponseDto } from '../dto/permission-response.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { RbacGuard } from '../rbac.guard';
import { RequirePermission } from './decorators/require-permission.decorator';

@ApiTags('Admin RBAC - Permissions')
@Controller('admin/rbac/permissions')
@UseGuards(AuthGuard, RbacGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({ status: HttpStatus.OK, type: [PermissionResponseDto] })
  @RequirePermission('permissions', 'read')
  async findAll(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionsService.findAll();
    return permissions.map((permission) =>
      PermissionResponseDto.fromEntity(permission),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PermissionResponseDto })
  @RequirePermission('permissions', 'create')
  async create(
    @Body() createPermissionDto: CreatePermissionDto,
  ): Promise<PermissionResponseDto> {
    const permission =
      await this.permissionsService.create(createPermissionDto);
    return PermissionResponseDto.fromEntity(permission);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing permission' })
  @ApiResponse({ status: HttpStatus.OK, type: PermissionResponseDto })
  @RequirePermission('permissions', 'update')
  async update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ): Promise<PermissionResponseDto> {
    const permission = await this.permissionsService.update(
      id,
      updatePermissionDto,
    );
    return PermissionResponseDto.fromEntity(permission);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a permission' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @RequirePermission('permissions', 'delete')
  async remove(@Param('id') id: string): Promise<void> {
    await this.permissionsService.remove(id);
  }
}
