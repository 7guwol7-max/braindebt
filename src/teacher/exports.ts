import type { ParticipantRow, ResultRow } from '../api/types';
import { topicById } from '../lib/content';
import { firstSentence } from '../lib/text';

export interface Row {
  nickname: string;
  status: string;
  consent: string;
  [k: string]: string | number;
}

const yesNo = (b: boolean) => (b ? '예' : '아니요');

export function buildRows(participants: ParticipantRow[], results: ResultRow[], withTexts: boolean): (string | number)[][] {
  const byId = new Map(results.map((r) => [r.participant_id, r.payload]));
  const head = [
    '닉네임', '상태', '공개 동의', '순서', '직접 주제', 'AI 주제',
    '직접 쓰기(초)', 'AI 쓰기(초)', '직접 타자', 'AI 타자',
    '직접 예상(1-3)', 'AI 예상(1-3)', '직접 첫문장(%)', 'AI 첫문장(%)', '직접 빈칸', 'AI 빈칸',
    "직접 '내 글'", "AI '내 글'", '직접 기억점수', 'AI 기억점수', '부채(점)',
    'AI 수정비율(%)', 'AI 다시쓰기', 'AI 읽기(초)', 'AI 요청',
    '설문1 AI 빈도', '설문2 고치기', '설문3 용도', '설문4 쉬운 쪽',
  ];
  const textHead = ['직접 원문', 'AI 원문', 'AI 마지막 초안', '직접 기억 첫문장', 'AI 기억 첫문장', '직접 원문 첫문장', 'AI 원문 첫문장'];
  const rows: (string | number)[][] = [withTexts ? [...head, ...textHead] : head];
  for (const p of participants) {
    const r = byId.get(p.id);
    const status = p.kicked ? '퇴장' : p.spectator ? '관전' : r ? '완료' : '진행 중';
    if (!r) {
      rows.push([p.nickname, status, yesNo(p.consent)]);
      continue;
    }
    const m = r.metrics;
    const line: (string | number)[] = [
      p.nickname, status, yesNo(p.consent), r.order === 'self_first' ? '직접 먼저' : 'AI 먼저',
      topicById(r.topicSelf).short, topicById(r.topicAi).short,
      m.self.writeSec, m.ai.writeSec, m.self.typed, m.ai.typed,
      m.self.prediction ?? '', m.ai.prediction ?? '', m.self.quoteSim, m.ai.quoteSim,
      `${m.self.clozeCorrect}/${m.self.clozeTotal}`, `${m.ai.clozeCorrect}/${m.ai.clozeTotal}`,
      m.self.ownership ?? '', m.ai.ownership ?? '', m.self.memory, m.ai.memory, m.comparable ? m.debt : '',
      m.ai.editRatio ?? '', m.ai.regenCount, m.ai.readSec ?? '', m.ai.prompt,
      r.survey.q1 ?? '', r.survey.q2 ?? '', r.survey.q3 ?? '', r.survey.q4 ?? '',
    ];
    if (withTexts) {
      line.push(
        r.writings.self.text, r.writings.ai.text, r.writings.ai.lastDraft, r.tests.self.quote, r.tests.ai.quote,
        firstSentence(r.writings.self.text), firstSentence(r.writings.ai.text),
      );
    }
    rows.push(line);
  }
  return rows;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

export function downloadCsv(rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}

export async function downloadXlsx(rows: (string | number)[][], name: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = rows.map((r, i) => r.map((v) => (i === 0 ? { value: String(v), fontWeight: 'bold' as const } : v)));
  const blob = await writeXlsxFile(data).toBlob();
  download(blob, `${name}.xlsx`);
}
