import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Carrier } from './entities/carrier.entity';

@Injectable()
export class CarrierService {
  private readonly logger = new Logger(CarrierService.name);

  constructor(@InjectRepository(Carrier) private readonly repo: Repository<Carrier>) {}

  async list() {
    try {
      return await this.repo.find({ where: { status: 'active' }, order: { name: 'ASC' } });
    } catch (err: any) {
      this.logger.error(`list carriers failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException(`Carrier query failed: ${err.message}`);
    }
  }
}
