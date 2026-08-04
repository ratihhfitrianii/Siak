/**
 * T1.13 — Socket.io Waiting Room: klien dengan token bergabung ke room,
 * `notifyEnter(token)` mengirim `waiting:enter_now` (K-09, docs/02 §7.1 langkah 4).
 *
 * Server nyata (http + Socket.io) di port ephemeral; client pakai socket.io-client.
 * Tidak butuh Redis.
 */
import http from 'http';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../app';
import { attachWaitingRoomSocket, type WaitingRoomSocket } from './waiting-room.socket';

describe('Waiting Room Socket (T1.13)', () => {
  let server: http.Server;
  let wrSocket: WaitingRoomSocket;
  let port: number;

  beforeAll(async () => {
    const app = createApp({}); // NODE_ENV=test → tanpa gate
    server = http.createServer(app);
    wrSocket = attachWaitingRoomSocket(server);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(async () => {
    wrSocket.io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(token?: string): Promise<ClientSocket> {
    const client = ioc(`http://localhost:${port}/waiting-room`, {
      transports: ['websocket'],
      query: token ? { token } : undefined,
      reconnection: false,
    });
    return new Promise((resolve, reject) => {
      client.on('connect', () => resolve(client));
      client.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    });
  }

  it('klien dengan token menerima waiting:enter_now saat slot bebas', async () => {
    const client = await connect('token-abc');
    const received = new Promise<{ token: string }>((resolve) => {
      client.on('waiting:enter_now', resolve);
    });

    wrSocket.notifyEnter('token-abc');

    const payload = await received;
    expect(payload.token).toBe('token-abc');
    client.close();
  });

  it('klien dengan token berbeda TIDAK menerima notifikasi token lain', async () => {
    const clientA = await connect('token-A');
    const clientB = await connect('token-B');
    let gotA = false;
    clientA.on('waiting:enter_now', () => {
      gotA = true;
    });
    const gotB = new Promise<void>((resolve) => {
      clientB.on('waiting:enter_now', () => resolve());
    });

    wrSocket.notifyEnter('token-B'); // hanya B yang dipanggil
    await gotB;
    await new Promise((r) => setTimeout(r, 300));
    expect(gotA).toBe(false);
    clientA.close();
    clientB.close();
  });

  it('klien tanpa token diputus koneksinya', async () => {
    const client = ioc(`http://localhost:${port}/waiting-room`, {
      transports: ['websocket'],
      reconnection: false,
    });
    const disconnected = new Promise<void>((resolve) => client.on('disconnect', () => resolve()));
    await new Promise((r) => setTimeout(r, 200));
    await disconnected;
    expect(client.connected).toBe(false);
    client.close();
  });
});
