export class ApiError extends Error {
  constructor(status, code, message, diagnostics) {
    super(message);
    this.status = status;
    this.code = code;
    this.diagnostics = diagnostics;
  }
}
