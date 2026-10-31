export enum IdentityProviderType {
  OIDC = 'OIDC',
  GOOGLE = 'GOOGLE',
  ENTRA = 'ENTRA',
  SAML = 'SAML',
}

export enum SsoSessionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}
