export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간이 없거나 막혀 있어도 체험은 계속된다 */
  }
}

/** 탭마다 따로 기억하는 값(sessionStorage)을 먼저 보고, 없으면 기기 전체 값(localStorage)을 본다.
 *  데모 모드에서 한 브라우저의 여러 탭이 서로 다른 학생으로 참여해도 섞이지 않게 한다. */
export function loadTabFirst<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* 무시 */
  }
  return load<T>(key);
}

export function saveBoth(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 무시 */
  }
  save(key, value);
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

/** 테스트·시연용: 주소에 ?speed=10 을 붙이면 모든 타이머가 10배 빨라진다. */
export const SPEED = (() => {
  try {
    const v = Number(new URLSearchParams(location.search).get('speed'));
    return v > 0 && v <= 100 ? v : 1;
  } catch {
    return 1;
  }
})();
