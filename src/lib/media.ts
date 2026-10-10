import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

/** 태블릿 사진을 긴 변 1280px JPEG 로 줄인다 (저장 공간·AI 비용 절약) */
export async function resizeImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source: CanvasImageSource & { width: number; height: number } =
    bitmap ??
    (await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    }));
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", quality));
}

/** 같은 사진을 다시 올리는지 확인하기 위한 지문 (8x8 평균 해시) */
export async function imageHash(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 8, 8);
  const { data } = ctx.getImageData(0, 0, 8, 8);
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) gray.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  let bits = "";
  for (const g of gray) bits += g >= avg ? "1" : "0";
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export async function uploadBlob(path: string, blob: Blob, contentType: string) {
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType });
  return path;
}

const urlCache = new Map<string, string>();
export async function fileUrl(path: string) {
  if (urlCache.has(path)) return urlCache.get(path)!;
  const url = await getDownloadURL(ref(storage, path));
  urlCache.set(path, url);
  return url;
}

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 녹음 형식: 갤럭시탭 크롬은 webm/opus */
export function pickAudioMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}
