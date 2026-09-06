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
import { GrantsService } from '../application/grants.service';
import { CreateGrantDto } from '../dto/create-grant.dto';
import { GrantResponseDto } from '../dto/grant-response.dto';
import { UpdateGrantDto } from '../dto/update-grant.dto';
import { RbacGuard } from '../rbac.guard';
import { RequirePermission } from './decorators/require-permission.decorator';

@ApiTags('Admin RBAC - Grants')
@Controller('admin/rbac/grants')
@UseGuards(AuthGuard, RbacGuard)
export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all grants' })
  @ApiResponse({ status: HttpStatus.OK, type: [GrantResponseDto] })
  @RequirePermission('grants', 'read')
  async findAll(): Promise<GrantResponseDto[]> {
    const grants = await this.grantsService.findAll();
    return grants.map((grant) => GrantResponseDto.fromEntity(grant));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new grant assignment' })
  @ApiResponse({ status: HttpStatus.CREATED, type: GrantResponseDto })
  @RequirePermission('grants', 'create')
  async create(
    @Body() createGrantDto: CreateGrantDto,
  ): Promise<GrantResponseDto> {
    const grant = await this.grantsService.create(createGrantDto);
    return GrantResponseDto.fromEntity(grant);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update allowed actions for a grant' })
  @ApiResponse({ status: HttpStatus.OK, type: GrantResponseDto })
  @RequirePermission('grants', 'update')
  async update(
    @Param('id') id: string,
    @Body() updateGrantDto: UpdateGrantDto,
  ): Promise<GrantResponseDto> {
    const grant = await this.grantsService.update(id, updateGrantDto);
    return GrantResponseDto.fromEntity(grant);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a grant assignment' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @RequirePermission('grants', 'delete')
  async remove(@Param('id') id: string): Promise<void> {
    await this.grantsService.remove(id);
  }
}
