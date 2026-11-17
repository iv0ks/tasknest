import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { HealthController } from './health.controller.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [TasksModule],
  controllers: [HealthController, AuthController],
})
export class AppModule {}
