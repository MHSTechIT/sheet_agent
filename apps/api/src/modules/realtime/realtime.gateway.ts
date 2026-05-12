import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: { origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',') },
})
export class RealtimeGateway {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  emit(event: string, payload: unknown) {
    if (!this.server) {
      this.log.warn(`emit before server ready: ${event}`);
      return;
    }
    this.server.emit(event, payload);
  }
}
