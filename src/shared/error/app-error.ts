export class AppError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, code: string = 'INTERNAL_ERROR', isOperational: boolean = true, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Requested resource not found', details?: unknown) {
    super(message, 'NOT_FOUND', true, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 'VALIDATION_ERROR', true, details);
  }
}

export class PermissionError extends AppError {
  constructor(message: string = 'Missing required permissions', details?: unknown) {
    super(message, 'PERMISSION_DENIED', true, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict occurred', details?: unknown) {
    super(message, 'CONFLICT', true, details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string = 'Incomplete or invalid configuration', details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', true, details);
  }
}
