import amqp from 'amqplib';
import { env } from '../config/env.js';

let connection;
let channel;

export async function initRabbitMQ() {
  if (channel) return channel;
  connection = await amqp.connect(env.AMQP_URL);
  channel = await connection.createChannel();
  return channel;
}

export async function publishToQueue(queue, msg) {
  const ch = await initRabbitMQ();
  await ch.assertQueue(queue, { durable: true });
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
    persistent: true
  });
}

export async function consumeQueue(queue, onMessage) {
  const ch = await initRabbitMQ();
  await ch.assertQueue(queue, { durable: true });
  await ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await onMessage(data);
      ch.ack(msg);
    } catch (err) {
      console.error('RabbitMQ message error', err);
      ch.nack(msg, false, false);
    }
  });
}

export async function closeRabbitMQ() {
  await channel?.close();
  await connection?.close();
  channel = undefined;
  connection = undefined;
}
