// ==UserScript==
// @name         SLR Download Preview GIF
// @namespace    https://github.com/whatamihere-4/userscripts
// @version      1.9.0
// @description  Download scene preview MP4 from SexLikeReal as a GIF
// @author       whatamihere-4
// @updateURL    https://raw.githubusercontent.com/whatamihere-4/userscripts/main/sexlikereal-download-preview-gif.user.js
// @downloadURL  https://raw.githubusercontent.com/whatamihere-4/userscripts/main/sexlikereal-download-preview-gif.user.js
// @match        *://*.sexlikereal.com/scenes/*
// @match        *://sexlikereal.com/scenes/*
// @connect      cdn-vr.sexlikereal.com
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_log
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const FPS = 15;
  const OUTPUT_WIDTH = 480;
  const PALETTE_SAMPLE_STEP = 8;
  const GIFENC_URL =
    "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.js";
  const PREVIEW_URL = (sceneId) =>
    `https://cdn-vr.sexlikereal.com/preview/14x1/${sceneId}_300p.mp4`;
  const DEBUG =
    localStorage.getItem("slr-gif-debug") === "1" ||
    sessionStorage.getItem("slr-gif-debug") === "1";

  const logLines = [];
  let gifencPromise = null;
  let activeSceneId = null;

  function log(message, detail) {
    const suffix =
      detail === undefined
        ? ""
        : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
    const line = `${message}${suffix}`;
    logLines.push(line);
    if (logLines.length > 30) {
      logLines.shift();
    }
    console.log("[SLR Preview GIF]", message, detail ?? "");
    try {
      GM_log(`[SLR Preview GIF] ${line}`);
    } catch (_e) {
      // GM_log unavailable in some managers.
    }
    refreshLogPanel();
  }

  function extractSceneId(pathname) {
    return (
      pathname.match(/-(\d+)\/?$/)?.[1] ??
      pathname.match(/\/(\d{4,10})\/?$/)?.[1] ??
      null
    );
  }

  function refreshLogPanel() {
    const panel = document.getElementById("slr-preview-gif-log");
    if (!panel) {
      return;
    }
    panel.textContent = logLines.join("\n");
  }

  function ensureLogPanel() {
    if (!DEBUG || document.getElementById("slr-preview-gif-log")) {
      return;
    }
    const panel = document.createElement("pre");
    panel.id = "slr-preview-gif-log";
    panel.textContent = logLines.join("\n");
    document.documentElement.appendChild(panel);
  }

  function ensureStyles() {
    if (document.getElementById("slr-preview-gif-style")) {
      return;
    }
    GM_addStyle(`
      #slr-preview-gif-btn {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483646;
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        background: #e91e8c;
        color: #fff;
        font: 600 14px/1.2 system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      #slr-preview-gif-btn:hover:not(:disabled) {
        background: #ff2da0;
      }
      #slr-preview-gif-btn:disabled {
        opacity: 0.7;
        cursor: wait;
      }
      #slr-preview-gif-status {
        position: fixed;
        bottom: 12px;
        left: 12px;
        z-index: 2147483646;
        max-width: min(420px, calc(100vw - 24px));
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(20, 20, 24, 0.92);
        color: #f5f5f5;
        font: 12px/1.35 ui-monospace, monospace;
        white-space: pre-wrap;
        pointer-events: none;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      }
      #slr-preview-gif-log {
        position: fixed;
        bottom: 12px;
        right: 12px;
        z-index: 2147483646;
        width: min(420px, calc(100vw - 24px));
        max-height: 240px;
        margin: 0;
        padding: 8px 10px;
        overflow: auto;
        border-radius: 6px;
        background: rgba(20, 20, 24, 0.92);
        color: #9fe8a6;
        font: 11px/1.35 ui-monospace, monospace;
        white-space: pre-wrap;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      }
    `);
    const marker = document.createElement("meta");
    marker.id = "slr-preview-gif-style";
    document.documentElement.appendChild(marker);
  }

  function setStatus(text) {
    let status = document.getElementById("slr-preview-gif-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "slr-preview-gif-status";
      (document.body || document.documentElement).appendChild(status);
    }
    status.textContent = text;
  }

  function removeButton() {
    document.getElementById("slr-preview-gif-btn")?.remove();
    activeSceneId = null;
  }

  function loadGifenc() {
    if (gifencPromise) {
      return gifencPromise;
    }

    log("Loading gifenc");
    gifencPromise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: GIFENC_URL,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Could not load gifenc (${response.status})`));
            return;
          }
          try {
            const module = { exports: {} };
            new Function("exports", response.responseText)(module.exports);
            log("gifenc loaded");
            resolve(module.exports);
          } catch (error) {
            reject(error);
          }
        },
        onerror() {
          reject(new Error("Network error while loading gifenc"));
        },
      });
    });

    return gifencPromise;
  }

  function fetchMp4(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "blob",
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.response);
            return;
          }
          reject(new Error(`Failed to fetch preview (${response.status})`));
        },
        onerror() {
          reject(new Error("Network error while fetching preview"));
        },
      });
    });
  }

  function waitForEvent(target, eventName) {
    return new Promise((resolve) => {
      target.addEventListener(eventName, resolve, { once: true });
    });
  }

  function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Failed to seek video"));
      };
      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.currentTime = time;
    });
  }

  async function captureFrames(video) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = Math.round(
      (video.videoHeight / video.videoWidth) * OUTPUT_WIDTH
    );

    const frameInterval = 1 / FPS;
    const totalFrames = Math.max(1, Math.floor(video.duration * FPS));
    const frameDelay = Math.round(1000 / FPS);
    const frames = [];

    for (let i = 0; i < totalFrames; i++) {
      const time = Math.min(i * frameInterval, video.duration);
      await seekVideo(video, time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        delay: frameDelay,
      });
    }

    return frames;
  }

  function buildGlobalPalette(frames, quantize) {
    const samples = [];
    for (let i = 0; i < frames.length; i += PALETTE_SAMPLE_STEP) {
      samples.push(frames[i].imageData.data);
    }

    const totalLength = samples.reduce((sum, data) => sum + data.length, 0);
    const pixels = new Uint8Array(totalLength);
    let offset = 0;
    for (const data of samples) {
      pixels.set(data, offset);
      offset += data.length;
    }

    return quantize(pixels, 256);
  }

  function encodeGif(frames, gifenc) {
    const { GIFEncoder, quantize, applyPalette } = gifenc;
    const gif = GIFEncoder();
    const palette = buildGlobalPalette(frames, quantize);

    for (let i = 0; i < frames.length; i++) {
      const { data, width, height } = frames[i].imageData;
      const index = applyPalette(data, palette);
      const opts = { delay: frames[i].delay };
      if (i === 0) {
        opts.palette = palette;
      }
      gif.writeFrame(index, width, height, opts);
    }

    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  }

  async function convertMp4ToGif(mp4Blob, gifenc, onProgress) {
    const videoUrl = URL.createObjectURL(mp4Blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;

    try {
      await waitForEvent(video, "loadedmetadata");

      if (!video.duration || !video.videoWidth || !video.videoHeight) {
        throw new Error("Preview video has no readable metadata");
      }

      onProgress("Capturing frames…");
      const frames = await captureFrames(video);

      onProgress("Encoding GIF…");
      return encodeGif(frames, gifenc);
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(videoUrl);
    }
  }

  function downloadGif(blob, filename) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      GM_download({
        url,
        name: filename,
        onload() {
          URL.revokeObjectURL(url);
          resolve();
        },
        onerror(error) {
          URL.revokeObjectURL(url);
          reject(error);
        },
      });
    });
  }

  function wireButton(button, sceneId) {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Converting…";
      log("Convert clicked", { sceneId });

      try {
        const gifenc = await loadGifenc();
        const mp4Blob = await fetchMp4(PREVIEW_URL(sceneId));
        log("Preview MP4 fetched", { bytes: mp4Blob.size });
        const gifBlob = await convertMp4ToGif(mp4Blob, gifenc, (text) => {
          button.textContent = text;
        });
        log("GIF encoded", { bytes: gifBlob.size });
        await downloadGif(gifBlob, `${sceneId}-preview.gif`);
        log("Download started", { filename: `${sceneId}-preview.gif` });
        button.textContent = originalText;
        setStatus(`SLR GIF: downloaded ${sceneId}-preview.gif`);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        log("Convert failed", message);
        console.error("[SLR Preview GIF]", error);
        button.textContent = "Failed";
        setStatus(`SLR GIF error: ${message}`);
        setTimeout(() => {
          button.textContent = originalText;
        }, 3000);
      } finally {
        button.disabled = false;
      }
    });
  }

  function ensureButton(sceneId) {
    const host = document.body || document.documentElement;
    let button = document.getElementById("slr-preview-gif-btn");

    if (!sceneId) {
      removeButton();
      setStatus("SLR GIF: no scene id in URL");
      log("No scene id", location.pathname);
      return false;
    }

    if (button && activeSceneId === sceneId) {
      return true;
    }

    removeButton();
    button = document.createElement("button");
    button.id = "slr-preview-gif-btn";
    button.textContent = "Download preview GIF";
    host.appendChild(button);
    wireButton(button, sceneId);
    activeSceneId = sceneId;
    setStatus(`SLR GIF ready: scene ${sceneId}`);
    log("Button injected", { sceneId, href: location.href });
    return true;
  }

  function syncUi() {
    ensureStyles();
    ensureLogPanel();
    const sceneId = extractSceneId(location.pathname);
    ensureButton(sceneId);
  }

  function watchNavigation() {
    let lastPath = location.pathname;
    const check = () => {
      if (location.pathname === lastPath) {
        return;
      }
      lastPath = location.pathname;
      log("Route changed", location.pathname);
      syncUi();
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      check();
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      check();
    };
    window.addEventListener("popstate", check);
    setInterval(check, 1000);
  }

  try {
    log("Script started", {
      href: location.href,
      debug: DEBUG,
      version: "1.9.0",
    });
    if (!DEBUG) {
      log("Verbose panel off; run localStorage.setItem('slr-gif-debug','1') and reload");
    }

    if (document.body) {
      syncUi();
    } else {
      log("document.body missing; waiting");
      setStatus("SLR GIF: waiting for page body…");
      const bodyObserver = new MutationObserver(() => {
        if (!document.body) {
          return;
        }
        bodyObserver.disconnect();
        log("document.body ready");
        syncUi();
      });
      bodyObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    watchNavigation();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error("[SLR Preview GIF] init failed", error);
    setStatus(`SLR GIF init failed: ${message}`);
    log("Init failed", message);
  }
})();
