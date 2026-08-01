import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function queueKey(prefix, name) {
  return `${prefix}:${name}`
}

export async function createRedisRuntime({
  url = process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  prefix = process.env.REDIS_QUEUE_PREFIX || 'lancee',
} = {}) {
  let connected = false

  async function command(args, timeout = 5_000) {
    const result = await execFileAsync('redis-cli', ['-u', url, '--raw', ...args], {
      timeout,
      maxBuffer: 1_000_000,
    })
    return result.stdout.trim()
  }

  try {
    await command(['PING'])
    connected = true
  } catch {
    connected = false
  }

  return {
    configured: Boolean(url),
    get connected() {
      return connected
    },
    queue: queueKey(prefix, 'core:automation:jobs'),
    async enqueue(job) {
      if (!this.connected) return false
      try {
        await command(['RPUSH', this.queue, JSON.stringify(job)])
        return true
      } catch {
        connected = false
        return false
      }
    },
    async startWorker(handler) {
      if (!this.connected) return () => {}
      let stopped = false
      const loop = async () => {
        while (!stopped) {
          let output = ''
          try {
            output = await command(['BLPOP', this.queue, '1'], 2_500)
          } catch {
            connected = false
            break
          }
          const separator = output.indexOf('\n')
          const element = separator === -1 ? '' : output.slice(separator + 1)
          if (!element) continue
          try {
            await handler(JSON.parse(element))
          } catch (error) {
            // The handler persists the failure against the run. Keep the worker alive.
            console.error('Core automation worker failed:', error)
          }
        }
      }
      void loop()
      return async () => { stopped = true }
    },
    async close() {},
  }
}
