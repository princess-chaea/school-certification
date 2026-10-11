import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadFormat, nextUploadTimes } from "./uploadTicket.js";

const now = 1_760_000_000_000;
const invalid = { code: "invalid-argument" };
const exhausted = { code: "resource-exhausted" };

test("photo uploads accept JPEG with a 5 MiB ceiling and reject other formats", () => {
  assert.deepEqual(uploadFormat("photo", "image/jpeg"), { extension: "jpg", maxBytes: 5 * 1024 * 1024 });
  for (const mime of ["image/png", "image/svg+xml", "text/html", "audio/webm", "image/jpeg;evil=yes"]) {
    assert.throws(() => uploadFormat("photo", mime), invalid);
  }
});

test("evidence and sentence audio accept recorder MIME types with a 10 MiB ceiling", () => {
  for (const kind of ["audio", "sentenceAudio"]) {
    for (const [mime, extension] of [["audio/webm", "webm"], ["audio/webm;codecs=opus", "webm"], ["audio/ogg;codecs=opus", "ogg"], ["audio/mp4", "m4a"], ["audio/mpeg", "mp3"], ["audio/wav", "wav"]]) {
      assert.deepEqual(uploadFormat(kind, mime), { extension, maxBytes: 10 * 1024 * 1024 });
    }
    for (const mime of ["image/jpeg", "audio/not-real", "audio/webm;evil=yes", "audio/webm\n", "text/html"]) {
      assert.throws(() => uploadFormat(kind, mime), invalid);
    }
  }
});

test("file uploads support classroom documents and media while rejecting active page formats", () => {
  for (const mime of ["application/pdf", "application/haansofthwp", "application/x-hwp", "application/hwp", "application/vnd.hancom.hwp", "application/vnd.hancom.hwpx", "application/octet-stream", "video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp"]) {
    assert.deepEqual(uploadFormat("file", mime), { extension: "bin", maxBytes: 10 * 1024 * 1024 });
  }
  for (const mime of ["text/html", "application/javascript", "image/svg+xml", "application/x-executable"]) {
    assert.throws(() => uploadFormat("file", mime), invalid);
  }
});

test("malformed upload kind or MIME is rejected", () => {
  for (const kind of [undefined, null, "video", {}, 1]) assert.throws(() => uploadFormat(kind, "image/jpeg"), invalid);
  for (const mime of [undefined, null, {}, 1, "", "x".repeat(101)]) assert.throws(() => uploadFormat("file", mime), invalid);
});

test("30 first-day uploads are accepted; the 61st upload inside ten minutes is blocked", () => {
  let times: number[] = [];
  for (let i = 0; i < 60; i++) times = nextUploadTimes(times, now);
  assert.equal(times.length, 60);
  assert.throws(() => nextUploadTimes(times, now), exhausted);
  assert.throws(() => nextUploadTimes(times, now + 599_999), exhausted);
  assert.equal(nextUploadTimes(times, now + 600_000).length, 61);
});

test("hourly limit permits 150 uploads spread across windows, then blocks the next", () => {
  const earlier = Array<number>(149).fill(now - 700_000);
  const atLimit = nextUploadTimes(earlier, now);
  assert.equal(atLimit.length, 150);
  assert.throws(() => nextUploadTimes(atLimit, now), exhausted);
});

test("expired history resets both windows without a daily submission limit", () => {
  const previous = Array<number>(150).fill(now - 3_600_000);
  assert.deepEqual(nextUploadTimes(previous, now), [now]);
  assert.equal(previous.length, 150);
  assert.deepEqual(nextUploadTimes([now - 3_600_001, now - 3_599_999], now), [now - 3_599_999, now]);
});

test("absent and malformed stored history is handled without counting invalid timestamps", () => {
  for (const value of [undefined, null, {}, "bad"]) assert.deepEqual(nextUploadTimes(value, now), [now]);
  assert.deepEqual(nextUploadTimes([null, "bad", NaN, Infinity, -Infinity, now - 1], now), [now - 1, now]);
});
