import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health endpoints for load balancers / orchestrators.
 * Public (no auth, no tenant context) and excluded from the global rate limit
 * so probes never get throttled.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return {
      status: 'ok',
      service: process.env.OTEL_SERVICE_NAME || 'business-os-backend',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks the database)' })
  async readiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ready',
        db: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
