# Sprint 8 – Feature Toggle Platform – ERD

## features (catalog)

| Column       | Type         | Notes                    |
|--------------|--------------|--------------------------|
| id           | uuid PK      |                          |
| code         | varchar(50)  | unique (sales, crm, …)   |
| name         | varchar(150) |                          |
| description  | text         |                          |
| category     | varchar(50)  | core / operations / …    |
| status       | varchar(20)  | active / deprecated      |
| created_at   | timestamptz  |                          |

## tenant_features

| Column      | Type         | Notes                              |
|-------------|--------------|------------------------------------|
| id          | uuid PK      |                                    |
| tenant_id   | uuid FK      | → tenants.id                       |
| feature_id  | uuid FK      | → features.id                      |
| enabled     | boolean      |                                    |
| enabled_at  | timestamptz  |                                    |
| enabled_by  | uuid FK      | → users.id                         |
| created_at  | timestamptz  |                                    |
| updated_at  | timestamptz  |                                    |

**Unique:** (tenant_id, feature_id)

## Distinction

| Concept    | Question                         |
|------------|----------------------------------|
| Feature    | Does this module exist for the tenant? |
| Permission | What can the user do?            |
| Scope      | What data can the user see?      |

## Plan presets

| Plan       | Features                                      |
|------------|-----------------------------------------------|
| Starter    | sales, crm                                    |
| Growth     | sales, crm, inventory                         |
| Business   | + accounting, tax                             |
| Enterprise | all                                           |
