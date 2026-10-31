import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { UserCompany } from '../organization/entities/user-company.entity';
import { UserBranch } from '../organization/entities/user-branch.entity';
import { UserDepartment } from '../organization/entities/user-department.entity';
import { LoginHistory } from '../administration/entities/login-history.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TenantUser,
      Tenant,
      UserCompany,
      UserBranch,
      UserDepartment,
      LoginHistory,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (() => { const s = config.get<string>('JWT_SECRET'); if (process.env.NODE_ENV === 'production' && (!s || s === 'dev-secret-change-me')) throw new Error('JWT_SECRET must be set in production'); return s || 'dev-secret-change-me'; })(),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h'),
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}