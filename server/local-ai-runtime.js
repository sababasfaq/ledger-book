import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { HttpError, requireValue } from "./finance.js";

const serverRoot = path.dirname(fileURLToPath(import.meta.url));
export const localAiDirectory = path.join(serverRoot, ".local-ai");
export class LocalOcr {
  constructor(
    directory = process.env.OCR_LANG_PATH ||
      path.join(localAiDirectory, "tessdata"),
  ) {
    this.directory = path.resolve(directory);
    this.worker = null;
    this.busy = false;
    this.idle = null;
  }
  status() {
    const languages = ["eng", "ben"].filter((code) =>
      fs.existsSync(path.join(this.directory, code + ".traineddata")),
    );
    return { ready: languages.length === 2, languages, busy: this.busy };
  }
  async recognize(dataUrl) {
    requireValue(
      !this.busy,
      "Another receipt is being read. Try again shortly.",
      429,
    );
    requireValue(
      typeof dataUrl === "string" && dataUrl.length <= 3 * 1024 * 1024,
      "Receipt images must be 2 MB or less",
    );
    const match = dataUrl.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/,
    );
    requireValue(match, "Choose a PNG, JPEG or WebP receipt image");
    const bytes = Buffer.from(match[2], "base64");
    requireValue(
      bytes.length > 0 && bytes.length <= 2 * 1024 * 1024,
      "Receipt images must be 2 MB or less",
    );
    requireValue(
      this.status().ready,
      "Local Bangla/English OCR files are missing. Run npm run ai:setup in server.",
      503,
    );
    this.busy = true;
    clearTimeout(this.idle);
    try {
      let image;
      try {
        image = await sharp(bytes, {
          limitInputPixels: 20_000_000,
          animated: false,
        })
          .rotate()
          .resize({
            width: 2000,
            height: 4000,
            fit: "inside",
            withoutEnlargement: true,
          })
          .grayscale()
          .normalize()
          .png()
          .toBuffer();
      } catch {
        throw new HttpError(
          400,
          "The receipt image is invalid or too large to decode",
        );
      }
      if (!this.worker)
        this.worker = await createWorker(["ben", "eng"], 1, {
          langPath: this.directory,
          gzip: false,
          cacheMethod: "none",
          errorHandler: () => {},
        });
      const pending = this.worker.recognize(image);
      let timer;
      const result = await Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HttpError(
                  504,
                  "Receipt reading took too long. Try a clearer, cropped image.",
                ),
              ),
            90000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      const text = result.data.text.trim().slice(0, 12000);
      requireValue(
        text.length >= 3,
        "No readable text was found. Try a clearer, straight photo.",
        422,
      );
      return {
        text,
        quality: Math.round(result.data.confidence),
        languages: ["ben", "eng"],
      };
    } catch (error) {
      await this.close();
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "The local OCR engine could not read this image. Check the OCR language files and try a clearer photo.",
      );
    } finally {
      this.busy = false;
      this.idle = setTimeout(() => this.close().catch(() => {}), 60000);
      this.idle.unref();
    }
  }
  async close() {
    clearTimeout(this.idle);
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}

export class LocalModel {
  constructor({
    baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model = process.env.OLLAMA_MODEL || "qwen3:1.7b",
    chatModel = process.env.OLLAMA_CHAT_MODEL || "qwen3:4b-instruct-2507-q4_K_M",
    fetchImpl = fetch,
  } = {}) {
    const url = new URL(baseUrl);
    requireValue(
      url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash,
      "The AI runtime must use a localhost HTTP address",
    );
    requireValue(
      [model, chatModel].every((name) => /^[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$/.test(name) && !name.toLowerCase().includes("cloud")),
      "Choose a locally installed model",
    );
    this.base = url.origin;
    this.model = model;
    this.preferredChatModel = chatModel;
    this.localModels = [];
    this.fetch = fetchImpl;
    this.busy = false;
    this.cached = null;
  }
  async status(fresh = false) {
    if (!fresh && this.cached && Date.now() - this.cached.at < 10000)
      return { ...this.cached.value, busy: this.busy };
    let value = {
      ready: false,
      runtimeAvailable: false,
      model: this.model,
      modelInstalled: false,
      busy: this.busy,
      reason: "Start the local AI runtime with npm run ai:setup in server.",
    };
    try {
      const response = await this.fetch(this.base + "/api/tags", {
        signal: AbortSignal.timeout(2500),
        redirect: "error",
      });
      if (response.ok) {
        const body = await response.json();
        this.localModels = Array.isArray(body.models) ? body.models.filter((item) => !item.remote_host && !item.remote_model).flatMap((item) => [item.name, item.model]).filter(Boolean) : [];
        const match = Array.isArray(body.models)
          ? body.models.find(
              (item) => item.name === this.model || item.model === this.model,
            )
          : null;
        const local = !!match && !match.remote_host && !match.remote_model;
        value = {
          ...value,
          runtimeAvailable: true,
          modelInstalled: local,
          ready: local,
          reason: local
            ? null
            : `The local model ${this.model} is not installed. Run npm run ai:setup in server.`,
        };
      }
    } catch {}
    this.cached = { at: Date.now(), value };
    return value;
  }
  async chatStatus(fresh = false) {
    const base = await this.status(fresh);
    const installed = base.runtimeAvailable && this.localModels.includes(this.preferredChatModel);
    return { ...base, ...(installed ? { model: this.preferredChatModel, ready: true, modelInstalled: true, reason: null } : {}),
      preferredModel: this.preferredChatModel, usingFallback: !installed && this.model !== this.preferredChatModel,
      upgradeCommand: "npm run ai:upgrade" };
  }
  async json(messages, schema, { maxTokens = 384, signal } = {}) {
    const content = await this.generate(messages, { schema, maxTokens, signal });
    try {
      return JSON.parse(content);
    } catch {
      throw new HttpError(
        502,
        "The local model returned an incomplete response. Try a shorter request.",
      );
    }
  }
  async text(messages, { maxTokens = 1024, signal, onToken, onFinish } = {}) {
    return this.generate(messages, { maxTokens, signal, onToken, onFinish });
  }
  async generate(messages, { schema, maxTokens, signal, onToken, onFinish }) {
    signal?.throwIfAborted();
    requireValue(
      !this.busy,
      "The local AI model is busy. Try again shortly.",
      429,
    );
    const status = schema ? await this.status() : await this.chatStatus();
    requireValue(status.ready, status.reason, 503);
    signal?.throwIfAborted();
    requireValue(
      !this.busy,
      "The local AI model is busy. Try again shortly.",
      429,
    );
    this.busy = true;
    try {
      const response = await this.fetch(this.base + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(schema ? 120000 : 600000)]) : AbortSignal.timeout(schema ? 120000 : 600000),
        body: JSON.stringify({
          model: status.model,
          messages,
          ...(schema ? { format: schema } : {}),
          stream: typeof onToken === "function",
          think: false,
          keep_alive: "1m",
          options: {
            temperature: schema ? 0 : 0.5,
            ...(!schema ? { repeat_penalty: 1.1, repeat_last_n: 128, top_p: 0.85 } : {}),
            num_ctx: schema ? 4096 : Math.min(16384, Math.max(4096, Number(process.env.LOCAL_AI_CONTEXT) || 8192)),
            num_predict: Math.min(schema ? 1024 : 2048, Math.max(128, maxTokens)),
            num_thread: Number(process.env.LOCAL_AI_THREADS) || 4,
            num_gpu: process.env.LOCAL_AI_USE_GPU === "true" ? -1 : 0,
          },
        }),
      });
      if (!response.ok) {
        if (response.status === 404) {
          this.cached = null;
          throw new HttpError(
            503,
            "The configured local model is missing. Run npm run ai:setup.",
          );
        }
        throw new HttpError(
          503,
          "The local model could not complete this request. Check the runtime and available memory.",
        );
      }
      if (typeof onToken === "function") {
        requireValue(response.body, "The model returned an empty stream", 502);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", answer = "", completed = false, finalPacket = null;
        const consume = (line) => {
          if (!line.trim()) return;
          let packet;
          try { packet = JSON.parse(line); } catch { throw new HttpError(502, "The model returned an invalid stream"); }
          if (packet.error) throw new HttpError(503, "The local model could not complete this request");
          const token = packet.message?.content || "";
          requireValue(typeof token === "string", "Invalid model response", 502);
          answer += token;
          requireValue(answer.length <= 30000, "The generated answer is too long", 502);
          if (token) onToken(token);
          if (packet.done) { completed = true; finalPacket = packet; }
        };
        try {
          for (;;) {
            signal?.throwIfAborted();
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            requireValue(buffer.length <= 100000, "Invalid model stream", 502);
            const lines = buffer.split("\n"); buffer = lines.pop();
            lines.forEach(consume);
          }
          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);
          requireValue(completed, "The reply was interrupted. Retry or continue from the visible text.", 502);
          onFinish?.({ model: status.model, truncated: finalPacket?.done_reason === "length" });
          return answer;
        } finally { await reader.cancel().catch(() => {}); }
      }
      const result = await response.json();
      requireValue(
        typeof result.message?.content === "string" &&
          result.message.content.length <= 30000,
        "The local model returned an invalid response",
        502,
      );
      onFinish?.({ model: status.model, truncated: result.done_reason === "length" });
      return result.message.content;
    } catch (error) {
      if (signal?.aborted) throw new HttpError(499, "Request cancelled");
      if (error instanceof HttpError) throw error;
      if (error.name === "TimeoutError" || error.name === "AbortError")
        throw new HttpError(
          504,
          "The local model timed out. Close unused applications and try again.",
        );
      throw new HttpError(
        503,
        "The local AI runtime is unavailable. Start it with npm run ai:setup.",
      );
    } finally {
      this.busy = false;
    }
  }
}

export const receiptSchema = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(
    [
      "merchant",
      "receiptNumber",
      "date",
      "totalAmount",
      "taxAmount",
      "currency",
      "categoryName",
      "itemSummary",
    ].map((key) => [key, { type: ["string", "null"] }]),
  ),
  required: [
    "merchant",
    "receiptNumber",
    "date",
    "totalAmount",
    "taxAmount",
    "currency",
    "categoryName",
    "itemSummary",
  ],
};
