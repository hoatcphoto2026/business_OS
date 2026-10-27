# Administration Center ERD

## New Tables

### tenant_settings
- id (uuid PK)
- tenant_id (uuid UNIQUE FK tenants)
- timezone, currency, language, date_format
- business_mode, accounting_mode
- copilot_enabled, notification_enabled
- created_at, updated_at

### login_histories
- id (uuid PK)
- tenant_id, user_id
- ip_address, user_agent
- login_at, logout_at
- created_at

### copilot_settings
- id (uuid PK)
- tenant_id (uuid UNIQUE FK tenants)
- enabled, provider, temperature, max_tokens, system_prompt
- created_at, updated_at

## Reused Tables
- users, tenant_users (User Management)
- teams, team_members (Team Management + Scope)
- roles, permissions, role_permissions, user_roles (RBAC)
- features, tenant_features (Feature Toggle)
- api_keys, webhooks (Integration Hub)
- audit_logs (Audit)
- event_logs (Event Bus)
- workflow_instances (Dashboard)

## Security
AdminOnlyGuard: only role in ['owner', 'admin'] can access /admin/*
