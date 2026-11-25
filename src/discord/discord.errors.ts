/*
Discord adapter errors.
Explain: Named meanings for expected delivery failures, reusing shared AppError
subclasses. Created because the message sender throws them.
*/

import { NotFoundError, PermissionError } from '../shared/error/app-error.js';

export const textChannelNotFoundError = new NotFoundError('Configured text channel is unavailable');
export const textChannelPermissionError = new PermissionError('Missing permissions to send text announcements');
