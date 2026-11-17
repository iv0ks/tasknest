// Tasks controller.
//
// A multi-tenant task board. Every user belongs to one organization and the
// session remembers which. Two endpoints respect that boundary:
//
//   GET  /api/tasks        → the caller's organization board   (scoped, safe)
//   POST /api/tasks        → create a task in the caller's org (scoped, safe)
//
// The three endpoints that address ONE task by its sequential id do not:
//
//   GET    /api/tasks/:id  → read ANY organization's task    (read IDOR)
//   PATCH  /api/tasks/:id  → modify ANY organization's task  (write IDOR)
//   DELETE /api/tasks/:id  → delete ANY organization's task  (write IDOR)
//
// The developers filtered by the resource id and trusted the login: "you need a
// session, and the id comes from your own board". Nothing compares the task's
// org with the caller's org, so the id counter — shared by every tenant — lets
// you walk straight into another organization's data (CWE-639).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard, type SessionData } from './auth.guard.js';
import { TasksService } from './tasks.service.js';

// Validated bodies. Input hardening is NOT the vulnerability here (the missing
// tenant check is), so these are the safe, strict kind of DTO.
class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done'])
  status?: string;
}

@Controller('api')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // SAFE: only your organization's tasks.
  @Get('tasks')
  async list(@Req() req: Request & { session: SessionData }) {
    const rows = await this.tasks.listForOrg(req.session.orgId!);
    return { tasks: rows };
  }

  // SAFE: the new task is stamped with the session's org, not a client value.
  @Post('tasks')
  async create(@Req() req: Request & { session: SessionData }, @Body() body: CreateTaskDto) {
    const task = await this.tasks.create(req.session.orgId!, req.session.userId!, body);
    return { ok: true, task };
  }

  // ⚠️ READ IDOR: fetches by id with no tenant check.
  @Get('tasks/:id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const task = await this.tasks.findById(id);
    if (!task) throw new NotFoundException('task not found');
    return { task };
  }

  // ⚠️ WRITE IDOR (update): rewrites any organization's task by id.
  @Patch('tasks/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateTaskDto) {
    const task = await this.tasks.update(id, body);
    if (!task) throw new NotFoundException('task not found');
    return { ok: true, task };
  }

  // ⚠️ WRITE IDOR (delete): deletes any organization's task by id.
  @Delete('tasks/:id')
  @HttpCode(200)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const task = await this.tasks.remove(id);
    if (!task) throw new NotFoundException('task not found');
    return { ok: true, task };
  }
}
