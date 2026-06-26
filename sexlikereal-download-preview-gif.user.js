// ==UserScript==
// @name         SLR Download Preview GIF
// @namespace    https://github.com/whatamihere-4/userscripts
// @version      1.2.0
// @description  Download scene preview MP4 from SexLikeReal as a GIF
// @author       whatamihere-4
// @updateURL    https://raw.githubusercontent.com/whatamihere-4/userscripts/main/sexlikereal-download-preview-gif.user.js
// @downloadURL  https://raw.githubusercontent.com/whatamihere-4/userscripts/main/sexlikereal-download-preview-gif.user.js
// @match        *://*.sexlikereal.com/scenes/*
// @connect      cdn-vr.sexlikereal.com
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getResourceURL
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js
// @resource     gifWorker https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const FPS = 60;
  const GIF_QUALITY = 10;
  const PREVIEW_URL = (sceneId) =>
    `https://cdn-vr.sexlikereal.com/preview/14x1/${sceneId}_300p.mp4`;

  const sceneId = location.pathname.match(/-(\d+)\/?$/)?.[1];
  if (!sceneId) {
    return;
  }

  GM_addStyle(`
    #slr-preview-gif-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 99999;
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
  `);

  const button = document.createElement("button");
  button.id = "slr-preview-gif-btn";
  button.textContent = "Download preview GIF";
  document.body.appendChild(button);

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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const fps = FPS;
    const frameInterval = 1 / fps;
    const totalFrames = Math.max(1, Math.floor(video.duration * fps));
    const frameDelay = Math.round(1000 / fps);
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

  function encodeGif(frames) {
    return new Promise((resolve, reject) => {
      const gif = new GIF({
        workers: 2,
        quality: GIF_QUALITY,
        workerScript: GM_getResourceURL("gifWorker"),
      });

      for (const frame of frames) {
        gif.addFrame(frame.imageData, { delay: frame.delay });
      }

      gif.on("finished", resolve);
      gif.on("abort", () => reject(new Error("GIF encoding aborted")));
      gif.render();
    });
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

  async function convertMp4ToGif(mp4Blob) {
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

      const frames = await captureFrames(video);
      return await encodeGif(frames);
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(videoUrl);
    }
  }

  button.addEventListener("click", async () => {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Converting…";

    try {
      const mp4Blob = await fetchMp4(PREVIEW_URL(sceneId));
      const gifBlob = await convertMp4ToGif(mp4Blob);
      await downloadGif(gifBlob, `${sceneId}-preview.gif`);
      button.textContent = originalText;
    } catch (error) {
      console.error("[SLR Preview GIF]", error);
      button.textContent = "Failed";
      setTimeout(() => {
        button.textContent = originalText;
      }, 3000);
    } finally {
      button.disabled = false;
    }
  });
})();
