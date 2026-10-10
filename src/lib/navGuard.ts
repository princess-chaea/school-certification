// 저장하지 않은 편집이 있을 때 탭 이동을 잠깐 붙잡는 장치 (BrowserRouter 라 라우터 차단 기능 대신 사용)
type Guard = (proceed: () => void) => void;
let guard: Guard | null = null;

export function setNavGuard(g: Guard | null) {
  guard = g;
}
/** 메뉴 클릭 등: 편집 중이면 확인 팝업을 거쳐서, 아니면 바로 이동. 붙잡았으면 true */
export function holdNavigation(proceed: () => void) {
  if (!guard) return false;
  guard(proceed);
  return true;
}
