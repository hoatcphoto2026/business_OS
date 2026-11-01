import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityController } from './security.controller';
import { SecurityEventsService } from './services/security-events.service';
import { AlertRulesService } from './services/alert-rules.service';
import { LoginAttemptService } from './services/login-attempt.service';
import { ThreatDetectionService } from './services/threat-detection.service';
import { SecretRotationService } from './services/secret-rotation.service';
import { EmergencyAccessService } from './services/emergency-access.service';
import { SecurityEvent } from './entities/security-event.entity';
import { LoginAttempt } from './entities/login-attempt.entity';
import { LoginLocation } from './entities/login-location.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { SecretRotation } from './entities/secret-rotation.entity';
import { EmergencyAccess } from './entities/emergency-access.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { Webhook } from '../integration/entities/webhook.entity';
import { AdministrationModule } from '../administration/administration.module';
import { ScimModule } from '../scim/scim.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';

/**
 * EPIC C6 – Enterprise Security Hardening: detection, incident workflow,
 * alert rules, secret/API-key rotation, break-glass emergency access.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SecurityEvent,
      LoginAttempt,
      LoginLocation,
      AlertRule,
      SecretRotation,
      EmergencyAccess,
      ApiKey,
      Webhook,
    ]),
    AdministrationModule,
    ScimModule,
    AuditModule,
    RbacModule,
    TenantModule,
  ],
  controllers: [SecurityController],
  providers: [
    SecurityEventsService,
    AlertRulesService,
    LoginAttemptService,
    ThreatDetectionService,
    SecretRotationService,
    EmergencyAccessService,
  ],
  exports: [SecurityEventsService, LoginAttemptService, AlertRulesService],
})
export class SecurityModule {}
