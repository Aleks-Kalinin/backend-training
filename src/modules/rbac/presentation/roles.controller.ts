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
import { RolesService } from '../application/roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { RoleResponseDto } from '../dto/role-response.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RbacGuard } from '../rbac.guard';
import { RequirePermission } from './decorators/require-permission.decorator';

@ApiTags('Admin RBAC - Roles')
@Controller('admin/rbac/roles')
@UseGuards(AuthGuard, RbacGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({ status: HttpStatus.OK, type: [RoleResponseDto] })
  @RequirePermission('roles', 'read')
  async findAll(): Promise<RoleResponseDto[]> {
    const roles = await this.rolesService.findAll();
    return roles.map((role) => RoleResponseDto.fromEntity(role));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: HttpStatus.CREATED, type: RoleResponseDto })
  @RequirePermission('roles', 'create')
  async create(@Body() createRoleDto: CreateRoleDto): Promise<RoleResponseDto> {
    const role = await this.rolesService.create(createRoleDto);
    return RoleResponseDto.fromEntity(role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing role' })
  @ApiResponse({ status: HttpStatus.OK, type: RoleResponseDto })
  @RequirePermission('roles', 'update')
  async update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    const role = await this.rolesService.update(id, updateRoleDto);
    return RoleResponseDto.fromEntity(role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a role' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @RequirePermission('roles', 'delete')
  async remove(@Param('id') id: string): Promise<void> {
    await this.rolesService.remove(id);
  }
}
