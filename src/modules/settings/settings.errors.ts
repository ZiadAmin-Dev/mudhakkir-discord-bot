/*
Settings module errors.
Explain: Define an error here when a settings component needs to throw one. Each
constant gives the error a specific meaning while reusing a shared AppError type.
*/

import { NotFoundError } from '../../shared/error/app-error.js';

export const settingsNotFoundError = new NotFoundError('No existing configuration found for guild');