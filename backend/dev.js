const http = require("http");
const { spawn } = require("child_process");

const port = Number(process.env.PORT) || 5000;

function startWatcher() {
  const watcher = spawn(process.execPath, ["--watch", "server.js"], {
    cwd: __dirname,
    stdio: "inherit",
  });

  let shutdownSignal = null;
  let spawnFailed = false;
  const forwardSignal = (signal) => {
    if (shutdownSignal) return;
    shutdownSignal = signal;
    if (!watcher.kill(signal)) process.exitCode = 1;
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  watcher.on("error", (error) => {
    spawnFailed = true;
    console.error(`Unable to start the backend watcher: ${error.message}`);
    process.exitCode = 1;
  });
  watcher.on("exit", (code, signal) => {
    if (spawnFailed) return;
    if (signal && !shutdownSignal) {
      console.error(`Backend watcher stopped by ${signal}.`);
      process.exitCode = 1;
    } else {
      process.exitCode = code === null ? 1 : code;
    }
  });
}

function checkExistingBackend() {
  const request = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: 1000 }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      let serviceName = "";
      try {
        serviceName = JSON.parse(body).name || "";
      } catch {
        serviceName = "";
      }
      if (response.statusCode === 200 && serviceName === "YouTube Watch Party API") {
        console.log(`Watch Party backend is already running on port ${port}; reusing it instead of starting a duplicate.`);
        console.log("Stop the existing backend process if you need to start the development watcher.");
        return;
      }
      console.error(`Port ${port} responded with another service; the Watch Party backend was not started.`);
      process.exitCode = 1;
    });
  });

  request.on("timeout", () => request.destroy(new Error("Health check timed out")));
  request.on("error", (error) => {
    if (error.code === "ECONNREFUSED") {
      startWatcher();
      return;
    }
    console.error(`Unable to safely check port ${port}; the Watch Party backend was not started: ${error.message}`);
    process.exitCode = 1;
  });
}

checkExistingBackend();
