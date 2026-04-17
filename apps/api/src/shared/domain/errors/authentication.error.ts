export class AuthenticationError extends Error {
  readonly code: string;

  constructor(
    message: string = "Authentication required",
    code: string = "AUTHENTICATION_REQUIRED"
  ) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}
