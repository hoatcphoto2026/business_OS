export enum ScimResourceType {
  USER = 'USER',
  GROUP = 'GROUP',
}

export enum ScimSyncTarget {
  ROLE = 'ROLE',
  DEPARTMENT = 'DEPARTMENT',
  ORGANIZATION = 'ORGANIZATION',
}

export enum ScimProvisionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  DEAD = 'DEAD',
}

export enum ScimOperation {
  CREATE_USER = 'CREATE_USER',
  UPDATE_USER = 'UPDATE_USER',
  SUSPEND_USER = 'SUSPEND_USER',
  DELETE_USER = 'DELETE_USER',
  GROUP_SYNC = 'GROUP_SYNC',
  DEPARTMENT_SYNC = 'DEPARTMENT_SYNC',
  ORGANIZATION_SYNC = 'ORGANIZATION_SYNC',
  ROLE_MAP = 'ROLE_MAP',
}

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCIM_ENTERPRISE_USER = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export const SCIM_GROUP_EXT = 'urn:ietf:params:scim:schemas:extension:businessos:2.0:Group';
export const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_BULK_REQUEST = 'urn:ietf:params:scim:api:messages:2.0:BulkRequest';
export const SCIM_BULK_RESPONSE = 'urn:ietf:params:scim:api:messages:2.0:BulkResponse';
export const SCIM_SP_CONFIG = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
export const SCIM_MAX_ATTEMPTS = 3;
