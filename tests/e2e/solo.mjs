// 혼자 체험하기 전체 흐름을 실제 브라우저로 돌린다. 사용: node tests/e2e/solo.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const SELF_TEXT = '나는 이 의견에 찬성한다. 왜냐하면 학생들이 스스로 결정하는 경험이 중요하기 때문이다. 또한 책임감도 함께 자랄 수 있다.';
const SELF_FIRST = '나는 이 의견에 찬성한다.';

// 컨테이너에 UTF-8 로캘이 없으면 크로미움이 한글 다운로드 파일 이름을 'download'로 바꾼다.
const browser = await chromium.launch({ executablePath: exe, env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${OUT}solo-${n}.png`, fullPage: true });

await page.goto(`${BASE}?speed=10#/`);
await page.getByText('10분 글쓰기 실험').first().waitFor();
await shot('01-home');
await page.getByRole('button', { name: '혼자 체험하기' }).click();
await page.getByLabel('이름 또는 닉네임 (선택)').fill('민지');
await shot('02-intro');
await page.getByRole('button', { name: '시작하기' }).click();

const doWrite = async (n) => {
  await page.locator('#essay').waitFor();
  const isAi = await page.getByText('🤖 AI 도우미와 쓰기').isVisible();
  if (isAi) {
    await page.getByRole('button', { name: '찬성하는 글 써줘' }).click();
    await page.waitForFunction(() => document.querySelector('#essay')?.value.length > 60 && !document.querySelector('#essay')?.readOnly);
    await shot(`03-write${n}-ai`);
    // 한 단어만 고친다.
    const v = await page.locator('#essay').inputValue();
    await page.locator('#essay').fill(v.replace('또한', '그리고'));
  } else {
    // 붙여넣기는 막혀 있어야 한다.
    await page.locator('#essay').fill(SELF_TEXT);
    await shot(`03-write${n}-self`);
  }
  await page.getByRole('button', { name: '제출하기' }).click();
  return isAi;
};
const first = await doWrite(1);
const second = await doWrite(2);
if (first === second) throw new Error('두 글의 조건이 같다');

await page.getByText('잠깐 쉬어 가요').waitFor();
for (const q of ['가끔', '조금 고쳐요', '숙제·과제', '비슷했어요']) await page.getByRole('button', { name: q, exact: true }).first().click();
await page.getByText('두뇌 체조').waitFor();
await shot('04-break');

await page.getByText('방금 쓴 두 글에 대해 물어볼게요').waitFor({ timeout: 15000 });
await shot('05-test-intro');
await page.getByRole('button', { name: '시작하기' }).click();
for (let k = 0; k < 2; k++) {
  await page.getByText('얼마나 기억날 것 같아요?').waitFor();
  const label = await page.locator('span.rounded-full', { hasText: '글' }).first().innerText();
  await page.getByRole('button', { name: /잘 기억날 듯/ }).click();
  await page.getByText('첫 문장').first().waitFor();
  // 직접 쓴 글 주제인지는 화면만으로 모르니, 첫 글은 기억하는 척, 둘째는 모른다고 한다.
  const selfTopicVisible = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bd:flow:solo'));
    return s.testOrder[s.testIndex] === 'self';
  });
  if (selfTopicVisible) {
    await page.locator('textarea').fill(SELF_FIRST);
    if (k === 0) await shot('06-quote');
    await page.getByRole('button', { name: '다음' }).click();
    const blanks = page.locator('input[aria-label^="빈칸"]');
    await blanks.first().waitFor();
    const answers = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('bd:flow:solo'));
      return s.tests.self.clozeExpected;
    });
    for (let i = 0; i < answers.length; i++) await blanks.nth(i).fill(answers[i]);
    await shot('07-cloze');
    await page.getByRole('button', { name: '다음' }).click();
  } else {
    await page.getByRole('button', { name: '전혀 기억나지 않아요' }).click();
    await page.locator('input[aria-label^="빈칸"]').first().waitFor();
    await page.getByRole('button', { name: '다음' }).click();
  }
  await page.getByText('"내 글"처럼 느껴지나요?').waitFor();
  await page.locator('input[type=range]').fill(selfTopicVisible ? '90' : '30');
  if (k === 1) await shot('08-own');
  await page.getByRole('button', { name: '다음' }).click();
  console.log('tested', label);
}

await page.getByText('인지 부채 청구서').waitFor();
await page.waitForTimeout(1200);
await shot('09-bill');
const result = await page.evaluate(() => JSON.parse(localStorage.getItem('bd:flow:solo')).result.metrics);
console.log(JSON.stringify(result, null, 1));
if (!(result.self.memory > 80)) throw new Error('직접 쓴 글 기억 점수가 낮다');
if (!(result.ai.memory < 20)) throw new Error('AI 글 기억 점수가 높다');
if (result.noDebt) throw new Error('부채가 있어야 한다');
if (!(result.ai.editRatio > 0 && result.ai.editRatio < 10)) throw new Error('수정 비율이 이상하다');

// 새로고침해도 청구서가 그대로
await page.reload();
await page.getByText('인지 부채 청구서').waitFor();

if (errors.length) {
  console.error('브라우저 오류:', errors);
  process.exitCode = 1;
}
await browser.close();
console.log('solo e2e ok');
