declare module 'pino' {
  export interface DestinationStream {
    write: (chunk: string | Uint8Array) => boolean;
  }

  export interface LoggerOptions {
    level?: string;
    base?: Record<string, string | number | boolean | null | undefined> | undefined;
  }

  export interface Logger {
    child: (
      bindings: Record<string, string | number | boolean | null | undefined>,
    ) => Logger;
    fatal: (obj: object | string, msg?: string) => void;
    error: (obj: object | string, msg?: string) => void;
    warn: (obj: object | string, msg?: string) => void;
    info: (obj: object | string, msg?: string) => void;
    debug: (obj: object | string, msg?: string) => void;
    trace: (obj: object | string, msg?: string) => void;
  }

  const pino: (
    options?: LoggerOptions,
    destination?: DestinationStream | NodeJS.WritableStream,
  ) => Logger;

  export default pino;
}

declare module 'pino-pretty' {
  import type { DestinationStream } from 'pino';

  type PrettyOptions = {
    colorize?: boolean;
    colorizeObjects?: boolean;
    singleLine?: boolean;
    sync?: boolean;
    translateTime?: string;
    ignore?: string;
    messageFormat?: string;
    destination?: DestinationStream | NodeJS.WritableStream;
  };

  const pretty: (options?: PrettyOptions) => DestinationStream;

  export default pretty;
}
