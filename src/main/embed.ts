import { join } from 'path'
import { Worker } from 'worker_threads'
import { is } from '@electron-toolkit/utils'
import { getPapersMissingEmbeddings, saveEmbeddings } from './db'
import { getSettings } from './settings'
import type { EmbedProgress } from '../shared/contract'

const BATCH_SIZE = 50
const LOCAL_BATCH_SIZE = 32
const MAX_RETRIES = 3

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- 本地推理 ----------
// 使用 onnxruntime-web（纯 WASM）+ transformers.js 分词器，在 worker_thread 中执行，
// 避免阻塞主进程事件循环。不使用 onnxruntime-node：其原生库在 Electron 运行时内
// 会触发 macOS 分配器崩溃（microsoft/onnxruntime#29763）。

type WorkerReply =
  | { type: 'ready' }
  | { type: 'vectors'; vectors: number[][] }
  | { type: 'error'; message: string }

interface LocalEngine {
  worker: Worker
  modelId: string
}

let localEngine: LocalEngine | null = null

function localModelDir(modelId: string): string {
  const base = is.dev ? join(__dirname, '../../resources/models') : join(process.resourcesPath, 'models')
  return join(base, modelId)
}

function sendToWorker<T extends WorkerReply['type']>(
  worker: Worker,
  msg: unknown,
  expect: T
): Promise<Extract<WorkerReply, { type: T }>> {
  return new Promise((resolve, reject) => {
    const onMessage = (reply: WorkerReply): void => {
      if (reply.type === 'error') {
        cleanup()
        reject(new Error(reply.message))
      } else if (reply.type === expect) {
        cleanup()
        resolve(reply as Extract<WorkerReply, { type: T }>)
      }
    }
    const onError = (err: Error): void => {
      cleanup()
      localEngine = null
      reject(new Error(`本地 Embedding 线程异常：${err.message}`))
    }
    // 不监听 exit 的话，worker 静默退出（OOM 等）会让本 Promise 永久挂起
    const onExit = (code: number): void => {
      cleanup()
      localEngine = null
      reject(new Error(`本地 Embedding 线程已退出（exit code ${code}）`))
    }
    const cleanup = (): void => {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
    }
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    worker.postMessage(msg)
  })
}

async function getLocalEngine(modelId: string): Promise<LocalEngine> {
  if (localEngine && localEngine.modelId === modelId) return localEngine
  if (localEngine) {
    void localEngine.worker.terminate()
    localEngine = null
  }
  const worker = new Worker(join(__dirname, 'embed-worker.js'))
  await sendToWorker(worker, { type: 'init', modelDir: localModelDir(modelId) }, 'ready')
  localEngine = { worker, modelId }
  return localEngine
}

async function embedLocal(texts: string[]): Promise<number[][]> {
  const engine = await getLocalEngine(getSettings().localEmbeddingModel)
  const reply = await sendToWorker(engine.worker, { type: 'embed', texts }, 'vectors')
  return reply.vectors
}

// ---------- 远程 API ----------

async function embedRemote(texts: string[]): Promise<number[][]> {
  const settings = getSettings()
  if (!settings.embeddingApiKey) {
    throw new Error('请先在设置页配置 Embedding API Key')
  }
  const baseUrl = settings.embeddingBaseUrl.replace(/\/+$/, '')
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.embeddingApiKey}`
        },
        body: JSON.stringify({ model: settings.embeddingModel, input: texts })
      })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }
    if (res.ok) {
      const body = (await res.json()) as EmbeddingResponse
      return body.data.map((d) => d.embedding)
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`Embedding API 错误 ${res.status}: ${await res.text()}`)
      continue
    }
    throw new Error(`Embedding API 错误 ${res.status}: ${await res.text()}`)
  }
  throw lastError ?? new Error('Embedding API 请求失败')
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (getSettings().embeddingProvider === 'local') return embedLocal(texts)
  return embedRemote(texts)
}

export async function runEmbeddingForPending(
  onProgress: (p: EmbedProgress) => void
): Promise<void> {
  const local = getSettings().embeddingProvider === 'local'
  const batchSize = local ? LOCAL_BATCH_SIZE : BATCH_SIZE
  const pending = getPapersMissingEmbeddings(100000)
  const total = pending.length
  if (total === 0) {
    onProgress({ status: 'done', total: 0, done: 0, message: '没有待向量化的论文' })
    return
  }
  let done = 0
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize)
    const texts = batch.map((p) => `${p.title}\n\n${p.abstract ?? ''}`)
    const vectors = await embedTexts(texts)
    saveEmbeddings(batch.map((p, j) => ({ id: p.id, vector: vectors[j] })))
    done += batch.length
    onProgress({ status: 'running', total, done, message: `已向量化 ${done}/${total} 篇论文` })
  }
  onProgress({ status: 'done', total, done, message: `向量化完成，共 ${done} 篇` })
}
