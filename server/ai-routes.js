import { Router } from "express";
import { HttpError } from "./finance.js";

export function createAiRouter(getService, authRequired) {
  const router = Router();
  router.use(authRequired);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const route = (method, path, handler) =>
    router[method](path, (req, res, next) =>
      Promise.resolve()
        .then(() => handler(getService(), req, res))
        .catch(next),
    );
  route("get", "/status", async (service, _req, res) =>
    res.json(await service.status()),
  );
  route("post", "/receipt", async (service, req, res) =>
    res.json(await service.scan(req.user, req.body || {})),
  );
  route("post", "/assistant", async (service, req, res) =>
    res.json(await service.ask(req.user, req.body || {})),
  );
  router.post("/assistant/stream", async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.on("aborted", abort);
    res.on("close", abort);
    res.status(200).set({ "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    const write = (event) => { if (!controller.signal.aborted && !res.writableEnded) res.write(JSON.stringify(event) + "\n"); };
    write({ type: "status", message: "Understanding your request…" });
    try {
      const result = await getService().ask(req.user, req.body || {}, {
        signal: controller.signal,
        onToken: (token) => write({ type: "token", text: token }),
        onStage: (message) => write({ type: "status", message }),
      });
      write({ type: "result", result });
    } catch (error) {
      if (!controller.signal.aborted) write({ type: "error", error: error instanceof HttpError ? error.message : "The assistant could not complete this request", status: error.status || 500 });
    } finally {
      req.off("aborted", abort); res.off("close", abort);
      if (!res.writableEnded) res.end();
    }
  });
  router.use((error, _req, res, _next) => {
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.message });
    console.error("Local AI request failed:", error.message);
    res
      .status(500)
      .json({ error: "The local AI request could not be completed" });
  });
  return router;
}
