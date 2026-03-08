import WebSocket from 'ws';

import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { Channel, NewMessage } from '../types.js';
import { ChannelOpts, registerChannel } from './registry.js';

const JID_PREFIX = 'webapp:';

export class WebappChannel implements Channel {
  name = 'webapp';

  private ws: WebSocket | null = null;
  private opts: ChannelOpts;
  private wsUrl: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(wsUrl: string, opts: ChannelOpts) {
    this.opts = opts;
    this.wsUrl = wsUrl;
  }

  async connect(): Promise<void> {
    this.connectWs();
  }

  private connectWs(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      logger.info('Webapp WebSocket connected');
      console.log(`\n  Webapp channel: ${this.wsUrl}\n`);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') {
          const chatJid = `${JID_PREFIX}${msg.appName || 'mission-control'}`;
          const timestamp = msg.timestamp
            ? new Date(msg.timestamp).toISOString()
            : new Date().toISOString();

          const newMsg: NewMessage = {
            id: msg.id || `webapp-${Date.now()}`,
            chat_jid: chatJid,
            sender: msg.sender || 'user',
            sender_name: msg.senderName || 'User',
            content: msg.content,
            timestamp,
            is_from_me: false,
          };

          this.opts.onMessage(chatJid, newMsg);
          this.opts.onChatMetadata(
            chatJid,
            timestamp,
            msg.appName || 'mission-control',
            'webapp',
            false,
          );
        }
      } catch (e) {
        logger.error({ err: e }, 'Webapp WebSocket parse error');
      }
    });

    this.ws.on('close', () => {
      logger.info('Webapp WebSocket disconnected, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connectWs(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error({ err: err.message }, 'Webapp WebSocket error');
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ jid }, 'Webapp WebSocket not connected, dropping message');
      return;
    }

    this.ws.send(
      JSON.stringify({ type: 'response', jid, text, timestamp: Date.now() }),
    );
    logger.info({ jid, length: text.length }, 'Webapp message sent');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith(JID_PREFIX);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      logger.info('Webapp WebSocket stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'typing', jid, isTyping }));
  }
}

registerChannel('webapp', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['WEBAPP_WS_URL']);
  const wsUrl = process.env.WEBAPP_WS_URL || envVars.WEBAPP_WS_URL || '';
  if (!wsUrl) {
    logger.warn('Webapp: WEBAPP_WS_URL not set');
    return null;
  }
  return new WebappChannel(wsUrl, opts);
});
