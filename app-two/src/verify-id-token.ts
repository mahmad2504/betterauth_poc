import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export type IdTokenVerifier = (idToken: string) => Promise<JWTPayload>;

export type IdTokenVerificationOptions = {
  issuer: string;
  audience: string;
  algorithms?: string[];
};

export function createIdTokenVerifier(
  getKey: JWTVerifyGetKey,
  options: IdTokenVerificationOptions,
): IdTokenVerifier {
  return async (idToken) => {
    if (!idToken) {
      throw new Error("The provider returned no ID token");
    }

    const { payload } = await jwtVerify(idToken, getKey, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: options.algorithms,
    });
    return payload;
  };
}

export function createRemoteIdTokenVerifier(
  jwksUri: string,
  options: IdTokenVerificationOptions,
) {
  return createIdTokenVerifier(
    createRemoteJWKSet(new URL(jwksUri)),
    options,
  );
}
