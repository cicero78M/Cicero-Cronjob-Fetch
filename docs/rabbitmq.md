# RabbitMQ Guide
*Last updated: 2025-07-10*

This document explains how to enable and use RabbitMQ in **Cicero_V2**. RabbitMQ processes heavy jobs asynchronously so the dashboard remains responsive.

## 1. Configuration

1. Ensure RabbitMQ is installed and running.
2. Set the connection URL in the `AMQP_URL` environment variable in `.env` (e.g. `amqp://localhost`).

## 2. Helper Functions

The project may include helper functions such as:

- `initRabbitMQ()` – create the connection and channel.
- `publishToQueue(queue, msg)` – send a JSON message to the queue.
- `consumeQueue(queue, onMessage)` – consume messages from the queue and execute a callback.

## 3. Tips

- Run the worker in a separate process using PM2 or another supervisor.
- Monitor the queue and RabbitMQ connection regularly to avoid bottlenecks.

## 4. Step-by-Step Setup

1. **Install RabbitMQ** (Ubuntu example)
   ```bash
   sudo apt-get install rabbitmq-server
   sudo systemctl enable rabbitmq-server
   sudo systemctl start rabbitmq-server
   ```
2. **Configure the environment**
   - Ensure `.env` contains `AMQP_URL=amqp://localhost` (or another host).
3. **Add the helper file** `src/service/rabbitMQService.js` containing
   `initRabbitMQ`, `publishToQueue`, and `consumeQueue`.
4. **Run a worker process** to handle heavy jobs
   ```javascript
   import { consumeQueue } from '../src/service/rabbitMQService.js';

   consumeQueue('heavy_task', async (data) => {
     // do processing here
   });
   ```
   Start it with `node worker.js` or `pm2 start worker.js`.
5. **Publish tasks** from your cron or controllers using
   `publishToQueue('heavy_task', payload)`.

---
See the README section *High Volume Queue (RabbitMQ)* for a short overview.
