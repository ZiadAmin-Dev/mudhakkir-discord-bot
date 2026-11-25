/*
Reminder module errors.
Explain: Define an error here when a reminder component needs to throw one.
*/

import { ConfigurationError } from '../../shared/error/app-error.js';

export const missingRoleMentionError = new ConfigurationError('Role mention configured without a role id');
