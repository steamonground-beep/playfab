import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  transport: config.isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: [
      'password', '*.password', 'passwordHash', '*.passwordHash',
      'token', '*.token', 'refreshToken', '*.refreshToken', 'accessToken', '*.accessToken',
      'secret', '*.secret', 'customSecret', '*.customSecret',
      'req.headers.authorization', 'req.headers.cookie', 'req.headers.x-api-key',
    ],
    censor: '[REDACTED]',
  },
});
