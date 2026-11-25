/*
Location module errors.
Explain: Named error constants for the conditions this module can raise, built
from the shared AppError categories.
*/

import { NotFoundError, ValidationError } from '../../shared/error/app-error.js';

export const countryNotFoundError = new NotFoundError('Country is not supported');
export const cityRequiredError = new ValidationError('A city is required for this country');
export const cityNotFoundError = new NotFoundError('City is not supported');
