import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('identity_mappings')
@Index(['providerId', 'externalSubject'], { unique: true })
export class IdentityMapping extends BaseTenantEntity {
  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'external_subject', type: 'varchar', length: 255 })
  externalSubject!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;
}
