export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  write(message: string): void;
}

export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(message);
  }

  warn(message: string): void {
    console.warn(message);
  }

  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(message, error);
    } else {
      console.error(message);
    }
  }

  write(message: string): void {
    process.stdout.write(message);
  }
}

/**
 * MCPサーバー実行時用ロガー
 * 標準出力(stdout)は JSON-RPC 通信専用のため、ログはすべて stderr に出力する
 */
export class McpLogger implements Logger {
  info(message: string): void {
    console.error(`[INFO] ${message}`);
  }

  warn(message: string): void {
    console.error(`[WARN] ${message}`);
  }

  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }

  write(message: string): void {
    process.stderr.write(message);
  }
}

export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  write(): void {}
}

let currentLogger: Logger = new ConsoleLogger();

export function getLogger(): Logger {
  return currentLogger;
}

export function setLogger(logger: Logger): void {
  currentLogger = logger;
}
