/*
Shared clock contract.
Explain: Scheduling depends on this port instead of Date.now() so tests can
advance time deterministically. SystemClock is the production implementation.
*/

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
