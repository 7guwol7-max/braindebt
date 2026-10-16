// 수업 전체 흐름: 교수자 콘솔 + 발표 화면 + 학생 폰 3대(+늦게 온 학생 1명)를 한 브라우저(데모 백엔드)에서 돌린다.
// 사용: node tests/e2e/class.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// 컨테이너에 UTF-8 로캘이 없으면 크로미움이 한글 다운로드 파일 이름을 'download'로 바꾼다.
const browser = await chromium.launch({ executablePath: exe, env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'ko-KR', acceptDownloads: true });
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && !m.text().includes('Failed to load resource') && errors.push(`${name}: ${m.text()}`));
};
const step = (s) => console.log(`▶ ${s}`);
const check = (cond, msg) => {
  if (!cond) throw new Error(`실패: ${msg}`);
};

// ---------------------------------------------------------------- 교수자: 수업 만들기
const teacher = await ctx.newPage();
watch(teacher, 'teacher');
await teacher.goto(`${BASE}#/teach`);
step('수업 만들기');
await teacher.getByPlaceholder('예: 2학년 3반 국어').fill('2학년 3반 국어');
await teacher.getByRole('button', { name: '휴대폰 · 급식' }).click();
await teacher.getByPlaceholder('예: 4821').fill('4821');
await teacher.screenshot({ path: `${OUT}class-01-create.png`, fullPage: true });
await teacher.getByRole('button', { name: '수업 만들기' }).click();
await teacher.waitForURL(/#\/t\/\d{6}$/);
const code = teacher.url().match(/#\/t\/(\d{6})/)[1];
console.log('code', code);

const present = await ctx.newPage();
watch(present, 'present');
await present.goto(`${BASE}#/t/${code}/present`);
await present.getByText('들어온 사람 0명').waitFor();

// ---------------------------------------------------------------- 학생 입장
const mobile = async (name) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  watch(p, name);
  return p;
};
const students = [
  { name: '지민', consent: true, self: '나는 이 주장에 찬성한다. 왜냐하면 학생의 의견도 존중받아야 하기 때문이다. 또한 스스로 정한 규칙은 더 잘 지키게 된다.' },
  { name: '서준', consent: true, self: '나는 반대한다. 학교는 공부에 집중하는 곳이라서 생각보다 문제가 많을 것 같다. 그리고 선생님들이 관리하기도 힘들다.' },
  { name: '하윤', consent: false, self: '찬성하는 편이다. 우리가 직접 고르면 더 즐겁게 생활할 수 있다. 다만 서로 배려하는 약속이 꼭 필요하다.' },
];
for (const s of students) {
  s.page = await mobile(s.name);
  await s.page.goto(`${BASE}#/join/${code}`);
  await s.page.getByPlaceholder('선생님이 알아볼 수 있는 이름').fill(s.name);
  if (!s.consent) await s.page.getByRole('checkbox').uncheck();
  if (s.name === '지민') await s.page.screenshot({ path: `${OUT}class-02-join.png`, fullPage: true });
  await s.page.getByRole('button', { name: '참여하기' }).click();
  await s.page.getByText('선생님이 시작하면 바로 시작돼요').waitFor();
}
step('학생 3명 입장');
await present.getByText('들어온 사람 3명').waitFor();
await present.screenshot({ path: `${OUT}class-03-present-lobby.png` });
await teacher.getByText('하윤').first().waitFor();
await teacher.screenshot({ path: `${OUT}class-04-console-lobby.png`, fullPage: true });

// ---------------------------------------------------------------- 모두 시작 · 일시 정지
step('모두 시작');
await present.getByRole('button', { name: '▶ 모두 시작' }).click();
for (const s of students) await s.page.locator('#essay').waitFor();
await present.getByText('글을 쓰고, 기억을 시험하는 중').waitFor();
step('일시 정지 → 학생 화면 멈춤');
await present.getByRole('button', { name: '⏸ 일시 정지' }).click();
await students[0].page.getByText('선생님이 잠시 멈췄어요').waitFor();
await students[0].page.screenshot({ path: `${OUT}class-05-paused.png` });
await present.getByRole('button', { name: '▶ 다시 시작' }).click();
await students[0].page.getByText('선생님이 잠시 멈췄어요').waitFor({ state: 'hidden' });

// 늦게 온 학생은 관전 모드
const late = await mobile('늦은');
await late.goto(`${BASE}#/join/${code}`);
await late.getByText('관전 모드로 참여해요').waitFor();
await late.getByPlaceholder('선생님이 알아볼 수 있는 이름').fill('늦은학생');
await late.getByRole('button', { name: '참여하기' }).click();
await late.getByText('이미 시작한 수업이에요').waitFor();

// ---------------------------------------------------------------- 학생: 글쓰기 2편
async function write(s) {
  const p = s.page;
  for (let n = 0; n < 2; n++) {
    await p.locator('#essay').waitFor();
    await p.waitForTimeout(150);
    const isAi = await p.getByText('🤖 AI 도우미와 쓰기').isVisible();
    if (!isAi) {
      await p.locator('#essay').fill(s.self);
    } else if (s.name === '지민') {
      await p.getByRole('button', { name: '찬성하는 글 써줘' }).click();
      await p.waitForFunction(() => document.querySelector('#essay')?.value.length > 60 && !document.querySelector('#essay')?.readOnly);
    } else if (s.name === '서준') {
      await p.getByLabel('AI에게 요청하기').fill('반대하는 글 써줘');
      await p.getByRole('button', { name: '보내기' }).click();
      await p.waitForFunction(() => document.querySelector('#essay')?.value.length > 60 && !document.querySelector('#essay')?.readOnly);
      await p.getByRole('button', { name: '🔄 다시 써줘' }).click();
      await p.waitForFunction(() => !document.querySelector('#essay')?.readOnly && document.querySelector('#essay')?.value.length > 60);
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}class-06-ai-chat.png`, fullPage: true });
      const v = await p.locator('#essay').inputValue();
      const parts = v.split('. ');
      await p.locator('#essay').fill(`${parts[0]}. 내 생각에는 공부할 때 방해가 너무 많이 된다. 친구들끼리 다툼도 늘어날 것 같다.`);
      s.aiFirst = parts[0];
    } else {
      await p.locator('#essay').fill('반대한다. 정해진 규칙이 있어야 모두가 편하다. 내가 직접 생각해서 쓴 글이다.');
    }
    s[isAi ? 'aiText' : 'selfText'] = await p.locator('#essay').inputValue();
    await p.getByRole('button', { name: '제출하기' }).click();
  }
  await p.getByText('잠깐 쉬어 가요').waitFor();
  for (const q of ['가끔', '조금 고쳐요', '숙제·과제', '비슷했어요']) await p.getByRole('button', { name: q, exact: true }).first().click();
  await p.getByText('두뇌 체조').waitFor();
}
step('학생들 글쓰기');
await Promise.all(students.map(write));
await teacher.getByText('쉬는 시간 3').waitFor();
await teacher.screenshot({ path: `${OUT}class-07-console-break.png`, fullPage: true });

// ---------------------------------------------------------------- 늦은 학생 다음 단계로 (쉬는 시간 → 기억 시험)
step('늦은 학생 다음 단계로');
await teacher.getByRole('button', { name: '⏭ 늦은 학생 다음 단계로' }).click();
await teacher.getByRole('button', { name: '넘기기' }).click();
for (const s of students) await s.page.getByText('방금 쓴 두 글에 대해 물어볼게요').waitFor();

const flowKey = (p, name) =>
  p.evaluate(
    ([c, n]) => Object.keys(localStorage).find((k) => k.startsWith(`bd:flow:${c}:`) && JSON.parse(localStorage.getItem(k)).nickname === n),
    [code, name],
  );

async function test(s) {
  const p = s.page;
  const key = await flowKey(p, s.name);
  await p.getByRole('button', { name: '시작하기' }).click();
  for (let k = 0; k < 2; k++) {
    await p.getByText('얼마나 기억날 것 같아요?').waitFor();
    const cond = await p.evaluate((k) => {
      const st = JSON.parse(localStorage.getItem(k));
      return st.testOrder[st.testIndex];
    }, key);
    await p.getByRole('button', { name: /잘 기억날 듯/ }).click();
    await p.locator('textarea').waitFor();
    const remember = cond === 'self' || s.name === '하윤' ? (cond === 'self' ? s.selfText : s.aiText).split('.')[0] : s.name === '서준' ? '반대한다 공부 방해' : '';
    if (remember) {
      await p.locator('textarea').fill(remember);
      await p.getByRole('button', { name: '다음' }).click();
    } else {
      await p.getByRole('button', { name: '전혀 기억나지 않아요' }).click();
    }
    const blanks = p.locator('input[aria-label^="빈칸"]');
    await blanks.first().waitFor();
    if (cond === 'self') {
      const ans = await p.evaluate((kk) => JSON.parse(localStorage.getItem(kk)).tests.self.clozeExpected, key);
      for (let i = 0; i < ans.length; i++) await blanks.nth(i).fill(ans[i]);
    }
    await p.getByRole('button', { name: '다음' }).click();
    await p.locator('input[type=range]').fill(cond === 'self' ? '85' : '35');
    await p.getByRole('button', { name: '다음' }).click();
  }
  await p.getByText('인지 부채 청구서').waitFor();
  await p.getByText('결과를 선생님께 보냈어요').waitFor();
}
step('학생들 기억 시험');
await Promise.all(students.map(test));
await students[1].page.screenshot({ path: `${OUT}class-08-student-bill.png`, fullPage: true });
await teacher.getByText('완료 3', { exact: false }).first().waitFor();

// ---------------------------------------------------------------- 발표: 반 결과 → 겹쳐보기 → 퀴즈 → 토론 → 소감 벽
step('반 결과 공개');
await present.getByRole('button', { name: '반 결과 공개 →' }).click();
await present.getByText('우리 반 결과 · 3명').waitFor();
await present.waitForTimeout(1500);
await present.screenshot({ path: `${OUT}class-09-present-results.png`, fullPage: true });
await students[0].page.getByText('우리 반 결과 · 3명').waitFor();
await students[0].page.waitForTimeout(1200);
await students[0].page.screenshot({ path: `${OUT}class-10-student-results.png`, fullPage: true });
await late.getByText('우리 반 결과 · 3명').waitFor();

step('겹쳐보기');
await present.getByRole('button', { name: '다음 →' }).click();
await present.getByText('방금 쓴 글의 첫 문장, 기억했을까?').waitFor();
await present.screenshot({ path: `${OUT}class-11-present-gallery.png`, fullPage: true });
await students[0].page.getByText('큰 화면을 봐 주세요').waitFor();
const galleryText = await present.locator('main').innerText();
check(!galleryText.includes('반대한다. 정해진 규칙'), '동의하지 않은 학생 글이 겹쳐보기에 나왔다');

step('퀴즈');
await present.getByRole('button', { name: '다음 →' }).click();
await present.getByText(/이 중 AI와 함께 쓴 글 \d편은\?/).waitFor();
const quizText = await present.locator('main').innerText();
check(!quizText.includes('하윤') && !quizText.includes('정해진 규칙이 있어야'), '동의하지 않은 학생 글이 퀴즈에 나왔다');
let round = 1;
for (;;) {
  for (const s of students) {
    const p = s.page;
    await p.getByText(/AI와 함께 쓴 글 \d편을 골라 보세요/).waitFor();
    const pick = Number((await p.getByText(/AI와 함께 쓴 글 \d편을 골라 보세요/).innerText()).match(/(\d)편/)[1]);
    const cards = p.locator('button.rounded-2xl.border-2');
    for (let i = 0; i < pick; i++) await cards.nth(i).click();
    if (s.name === '지민' && round === 1) await p.screenshot({ path: `${OUT}class-12-student-quiz.png`, fullPage: true });
    await p.getByRole('button', { name: '제출하기' }).click();
    await p.getByText('정답 공개를 기다려요').waitFor();
  }
  // 관전 학생도 투표할 수 있어 분모는 4명(학생 3 + 관전 1)
  await present.getByText('투표 3 / 4명').waitFor();
  await present.getByRole('button', { name: '정답 공개' }).click();
  await present.getByText('모두 맞힌 사람').waitFor();
  await students[0].page.getByText('정답 공개!').waitFor();
  if (round === 1) {
    await present.screenshot({ path: `${OUT}class-13-present-quiz-reveal.png`, fullPage: true });
    await students[0].page.screenshot({ path: `${OUT}class-14-student-quiz-reveal.png`, fullPage: true });
  }
  if (await present.getByRole('button', { name: '다음 라운드 ▶' }).isVisible()) {
    await present.getByRole('button', { name: '다음 라운드 ▶' }).click();
    round++;
    await present.getByText(`${round} /`, { exact: false }).first().waitFor();
  } else break;
}
console.log('퀴즈 라운드', round);

step('토론');
await present.getByRole('button', { name: '토론으로 ▶' }).click();
await present.getByText('왜 이런 차이가 났을까?').waitFor();
await present.screenshot({ path: `${OUT}class-15-present-discuss.png`, fullPage: true });
for (const [i, s] of students.entries()) {
  await s.page.getByText('오늘 알게 된 것 한 줄').waitFor();
  await s.page.getByPlaceholder('예: AI 글은 읽기만 해서 기억이 안 났다').fill(
    ['AI 글은 읽기만 해서 기억이 하나도 안 났다', '고친 문장만 기억났다. 내가 쓴 부분이 남는다', '장난 소감'][i],
  );
  await s.page.getByRole('button', { name: '큰 화면에 보내기 (이름 없이)' }).click();
  await s.page.getByText('내가 보낸 소감').waitFor();
}
await students[0].page.screenshot({ path: `${OUT}class-16-student-reflect.png`, fullPage: true });

step('소감 벽 · 숨기기 · 리포트');
await present.getByRole('button', { name: '다음 →' }).click();
await present.getByText('장난 소감').waitFor();
await present.getByText('장난 소감').hover();
await present.locator('div.group', { hasText: '장난 소감' }).getByRole('button', { name: '숨기기' }).click();
await present.getByText('장난 소감').waitFor({ state: 'hidden' });
await present.getByText('숨긴 소감 1개').waitFor();
await present.screenshot({ path: `${OUT}class-17-present-wall.png`, fullPage: true });
await present.getByRole('button', { name: '수업 리포트 만들기' }).click();
await present.getByText('수업 리포트가 준비됐어요').waitFor();
const reportUrl = await present.locator('div.break-all').innerText();
const report = await ctx.newPage();
watch(report, 'report');
await report.goto(reportUrl.trim());
await report.getByText('2학년 3반 국어').waitFor();
await report.waitForTimeout(1300);
check(!(await report.locator('body').innerText()).includes('장난 소감'), '숨긴 소감이 리포트에 나왔다');
check(!(await report.locator('body').innerText()).includes('지민'), '리포트에 이름이 나왔다');
await report.screenshot({ path: `${OUT}class-18-report.png`, fullPage: true });

// ---------------------------------------------------------------- 콘솔: 수합 · 내보내기 · 퇴장
step('수합 탭');
await teacher.bringToFront();
await teacher.getByRole('button', { name: '수합' }).click();
await teacher.getByRole('cell', { name: '서준' }).waitFor();
await teacher.screenshot({ path: `${OUT}class-19-console-collect.png`, fullPage: true });
await teacher.getByRole('cell', { name: '서준' }).click();
await teacher.getByText('AI 초안 대비 바뀐 부분').waitFor();
await teacher.screenshot({ path: `${OUT}class-20-console-detail.png` });
await teacher.keyboard.press('Escape');
const [dl] = await Promise.all([teacher.waitForEvent('download'), teacher.getByRole('button', { name: 'CSV' }).click()]);
const csvPath = `${OUT}export.csv`;
await dl.saveAs(csvPath);
const csv = readFileSync(csvPath, 'utf8');
check(csv.startsWith('﻿닉네임'), 'CSV 머리글');
check(csv.split('\r\n').length === 4, `CSV 행 수 ${csv.split('\r\n').length}`);
const [dl2] = await Promise.all([teacher.waitForEvent('download'), teacher.getByRole('button', { name: '엑셀 (xlsx)' }).click()]);
check(dl2.suggestedFilename().endsWith('.xlsx') && dl2.suggestedFilename().startsWith('글쓰기실험'), `xlsx 파일 이름 ${dl2.suggestedFilename()}`);
check(dl.suggestedFilename().startsWith('글쓰기실험'), 'CSV 파일 이름');

step('퇴장');
await teacher.getByRole('button', { name: '운영' }).click();
// 관전 학생은 타일이 아니라 목록에 있으므로, 참여 학생 하윤을 퇴장시켜 본다.
await teacher.getByRole('button', { name: /하윤/ }).click();
await teacher.getByRole('button', { name: '퇴장', exact: true }).click();
await students[2].page.getByText('수업에서 퇴장되었어요').waitFor();

// 수업 데이터 확인
const metrics = await students[1].page.evaluate((k) => JSON.parse(localStorage.getItem(k)).result.metrics, await flowKey(students[1].page, '서준'));
console.log('서준', JSON.stringify({ self: metrics.self.memory, ai: metrics.ai.memory, edit: metrics.ai.editRatio, regen: metrics.ai.regenCount }));
check(metrics.ai.editRatio > 25, '서준의 수정 비율');
check(metrics.ai.regenCount === 1, '서준의 다시 쓰기 횟수');

if (errors.length) {
  console.error('브라우저 오류:', errors);
  process.exitCode = 1;
}
await browser.close();
console.log('class e2e ok');
