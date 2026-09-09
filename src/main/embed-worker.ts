/**
 * Embedding 推理 worker（worker_threads）。
 * 使用 onnxruntime-web（纯 WASM）+ @huggingface/transformers 分词器，
 * 在独立线程中执行推理，避免长时间阻塞主进程事件循环导致界面卡死。
 * 协议：收到 {type:'init'} 初始化；收到 {type:'embed', texts} 返回向量。
 */
import { parentPort } from 'worker_threads'
import { AutoTokenizer, env } from '@huggingface/transformers'
import { InferenceSession, Tensor } from 'onnxruntime-web'
import { join } from 'path'

const MAX_TOKENS = 512

type WorkerRequest =
  | { type: 'init'; modelDir: string }
  | { type: 'embed'; texts: string[] }

let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null
let session: InferenceSession | null = null

async function embed(texts: string[]): Promise<number[][]> {
  if (!tokenizer || !session) throw new Error('本地模型未初始化')
  const enc = await tokenizer(texts, { padding: true, truncation: true, max_length: MAX_TOKENS })
  const dims: [number, number] = [texts.length, Number(enc.input_ids.dims[1])]
  const mkTensor = (data: ArrayLike<bigint | number>): Tensor => {
    const arr = new BigInt64Array(dims[0] * dims[1])
    for (let i = 0; i < arr.length; i++) arr[i] = BigInt(data[i] ?? 0)
    return new Tensor('int64', arr, dims)
  }
  const output = await session.run({
    input_ids: mkTensor(enc.input_ids.data),
    attention_mask: mkTensor(enc.attention_mask.data),
    token_type_ids: mkTensor(enc.token_type_ids?.data ?? [])
  })
  const hidden = output.last_hidden_state
  const H = Number(hidden.dims[2])
  const data = hidden.data as Float32Array
  const vectors: number[][] = []
  for (let b = 0; b < dims[0]; b++) {
    // BGE 模型使用 [CLS] token 池化
    const start = b * dims[1] * H
    const v = Array.from(data.subarray(start, start + H))
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
    vectors.push(v.map((x) => x / norm))
  }
  return vectors
}

parentPort?.on('message', (msg: WorkerRequest) => {
  void (async () => {
    try {
      if (msg.type === 'init') {
        env.allowRemoteModels = false
        env.allowLocalModels = true
        tokenizer = await AutoTokenizer.from_pretrained(msg.modelDir)
        session = await InferenceSession.create(join(msg.modelDir, 'onnx/model_quantized.onnx'))
        parentPort?.postMessage({ type: 'ready' })
      } else if (msg.type === 'embed') {
        parentPort?.postMessage({ type: 'vectors', vectors: await embed(msg.texts) })
      }
    } catch (err) {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })()
})
