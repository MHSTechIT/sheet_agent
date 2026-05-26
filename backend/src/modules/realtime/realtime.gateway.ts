import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  // Resolve allowed origins per-request so we read the *current* WEB_ORIGIN
  // (decorators evaluate at import time — too early for env loaders).
  cors: {
    origin: (origin, cb) => {
      const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',');
      cb(null, !origin || allowed.includes(origin));
    },
    credentials: true,
  },
})
export class RealtimeGateway {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  emit(event: string, payload: unknown) {
    if (!this.server) {
      this.log.warn(`emit before server ready: ${event}`);
      return;
    }
    // A Socket.IO failure must never crash the cron poller / job processors.
    try {
      this.server.emit(event, payload);
    } catch (e: any) {
      this.log.warn(`emit '${event}' failed: ${e?.message ?? e}`);
    }
  }
}
