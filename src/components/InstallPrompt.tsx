import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PixelIcon } from "./Pixel";
import { toast } from "./ui";
import { canPromptInstall, isStandalone, onInstallChange, platform, promptInstall, type Platform } from "../lib/install";

const NEVER = "installPrompt.never";
const read = (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } };
const write = (s: Storage, k: string, v: string) => { try { s.setItem(k, v); } catch { /* 사생활 보호 모드 등 */ } };

/** 휴대폰·태블릿 브라우저로 쓰는 중이면 접속(로그인)할 때마다 "앱으로 설치" 안내 — [다시 보지 않기]·설치 전까지 */
function shouldShow() {
  if (isStandalone()) return false; // 이미 설치한 앱으로 열었음
  if (read(localStorage, NEVER)) return false;
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  return touch || canPromptInstall();
}

const STEPS: Record<Exclude<Platform, "desktop">, { icon: string; text: string }[]> = {
  ios: [
    { icon: "upload", text: "Safari(사파리) 아래쪽(아이패드는 위쪽)의 공유 버튼 [□↑]을 눌러요." },
    { icon: "plus", text: "목록을 내려 [홈 화면에 추가]를 눌러요." },
    { icon: "check", text: "오른쪽 위 [추가]를 누르면 홈 화면에 앱이 생겨요." },
  ],
  inapp: [
    { icon: "alert", text: "카카오톡·네이버 같은 앱 안의 창에서는 설치할 수 없어요." },
    { icon: "link", text: "오른쪽 아래(또는 위) [⋮]·공유 버튼 → [다른 브라우저로 열기]를 눌러요." },
    { icon: "download", text: "크롬·삼성 인터넷·사파리에서 다시 로그인하면 설치 안내가 나와요." },
  ],
  samsung: [
    { icon: "gear", text: "아래쪽 메뉴 [≡]를 눌러요." },
    { icon: "plus", text: "[현재 페이지 추가] → [홈 화면]을 눌러요." },
    { icon: "check", text: "홈 화면에 생긴 아이콘으로 열어요." },
  ],
  android: [
    { icon: "gear", text: "오른쪽 위 메뉴 [⋮]를 눌러요." },
    { icon: "download", text: "[앱 설치] 또는 [홈 화면에 추가]를 눌러요." },
    { icon: "check", text: "홈 화면에 생긴 아이콘으로 열어요." },
  ],
};

export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const p = platform();

  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), []);
  useEffect(() => {
    // 로그인 화면이 바뀐 직후 바로 덮지 않게 잠깐 뒤에
    const t = setTimeout(() => {
      if (shouldShow()) setOpen(true);
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;

  const close = () => setOpen(false);
  const never = () => { write(localStorage, NEVER, "1"); close(); };
  async function install() {
    if (await promptInstall()) {
      toast("설치했어요! 이제 홈 화면 아이콘으로 열어요.");
      write(localStorage, NEVER, "1");
    }
    close();
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.origin);
      toast("주소를 복사했어요. 크롬·삼성 인터넷·사파리에 붙여 넣어 열어요.");
    } catch {
      toast(location.origin);
    }
  }
  const steps = p === "desktop" ? STEPS.android : STEPS[p];

  return (
    <Modal title="앱으로 설치해요" icon="download" onClose={close}>
      <div className="install-hero">
        <img src="/icons/icon-192.png" alt="" width={64} height={64} />
        <div>
          <b>홈 화면에 인증제 앱을 놓아 두세요</b>
          <div className="install-perks">
            <span><PixelIcon name="home" size={16} /> 아이콘으로 바로</span>
            <span><PixelIcon name="star" size={16} /> 전체 화면</span>
            <span><PixelIcon name="lock" size={16} /> 로그인 유지</span>
          </div>
        </div>
      </div>
      {canPrompt && p !== "ios" && p !== "inapp" ? (
        <p className="small muted" style={{ margin: "12px 0 0" }}>아래 [앱 설치하기]를 누르고, 뜨는 창에서 [설치]를 누르면 끝이에요.</p>
      ) : (
        <ol className="install-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="install-no hud">{i + 1}</span>
              <PixelIcon name={s.icon} size={22} />
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="modal-actions">
        {canPrompt && p !== "ios" && p !== "inapp" ? (
          <button className="btn" autoFocus onClick={install}><PixelIcon name="download" size={18} /> 앱 설치하기</button>
        ) : p === "inapp" ? (
          <button className="btn" autoFocus onClick={copyLink}><PixelIcon name="link" size={18} /> 주소 복사</button>
        ) : (
          <button className="btn" autoFocus onClick={close}>알겠어요</button>
        )}
        <button className="btn ghost" onClick={close}>나중에</button>
      </div>
      <button className="install-never" onClick={never}>다시 보지 않기</button>
    </Modal>
  );
}
