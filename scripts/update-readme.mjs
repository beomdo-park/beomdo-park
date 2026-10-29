// scripts/update-readme.mjs
// README.md의 "At a Glance" 연구/성과/오픈소스 요약과
// last-updated 타임스탬프를 마커 주석 사이에 자동으로 다시 써넣는다.
// .github/workflows/update-stats.yml 에서 README.md push 시마다 실행됨.
// 의존성 없음 (Node 18+).
//
// 집계 (논문 줄만 추가하면 숫자가 자동으로 늘어남):
//   - 논문      : Research Timeline 의 배지 bullet(- ![...]) + <details> 안의 공저 bullet
//   - 특허      : "### 📝 Patent" 하위 배지 bullet (논문 수에서 제외)
//   - 국제/국내 : DOMESTIC/INTERNATIONAL 키워드로 분류
//   - Journal/Conf : JOURNAL 키워드 포함 여부로 분류 (SCI(E) 저널은 자연히 "국제 Journal"에 포함)
//   - SCI(E)    : `SCIE` 태그 포함 항목
//   - 1저자     : `1st author` 태그 포함 항목
//   - 활동      : "Experience & Activities" 표의 데이터 행

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'README.md';

// ── 새 venue에 게재하면 여기에 키워드만 추가하면 됩니다 ──
const DOMESTIC = ['IEIE', '대한전자공학회', 'KICS', '한국통신학회', '정보과학회', 'KIISE'];
const INTERNATIONAL = ['AAAI', 'IEEE', 'IJCAI', 'ECAI', 'KDD', 'Energies', 'MDPI', 'NeurIPS', 'ICML', 'ICLR', 'AISTATS', 'Springer', 'Elsevier'];
// 저널(=논문지) 판별 키워드. 하나라도 들어 있으면 Journal, 아니면 Conference.
const JOURNAL = ['SCIE', 'SCI', 'Transactions', 'Journal', 'Energies', 'MDPI', 'Access', 'Letters', 'Reports'];

const md0 = readFileSync(FILE, 'utf8');
const lines = md0.split('\n');

function sectionRange(match) {
  const start = lines.findIndex((l) => l.startsWith('## ') && l.includes(match));
  if (start === -1) return [-1, -1];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { end = i; break; }
  }
  return [start, end];
}

// ── Research Timeline 에서 논문/특허 수집 ──
const [rtStart, rtEnd] = sectionRange('Research Timeline');
const papers = [];
let patents = 0;
let inPatent = false;
let inDetails = false;

for (let i = rtStart + 1; i < rtEnd; i++) {
  const line = lines[i];
  if (line.startsWith('### ')) { inPatent = line.includes('Patent'); continue; }
  if (line.trim() === '<details>') { inDetails = true; continue; }
  if (line.trim() === '</details>') { inDetails = false; continue; }

  // 배지를 가진 bullet ( - ![...]  또는  - 🏆 ![...] )
  if (/^-\s+(?:[^\s]+\s+)?!\[/.test(line)) {
    if (inDetails) { papers.push(line); continue; } // <details> 안의 공저 = 단일 줄로 카운트
    const block = line + '\n' + (lines[i + 1] || '');
    if (inPatent) patents++;
    else papers.push(block);
    continue;
  }
  // 배지 없는 공저 항목(텍스트 형식)도 카운트
  if (inDetails && /^-\s+\S/.test(line)) papers.push(line);
}

// ── 분류 & 집계 (국제/국내 × Journal/Conf) ──
let intlJ = 0, intlC = 0, domJ = 0, domC = 0;
const unknown = [];
for (const t of papers) {
  const isDom = DOMESTIC.some((k) => t.includes(k));
  const isIntl = !isDom && INTERNATIONAL.some((k) => t.includes(k));
  if (!isDom && !isIntl) { unknown.push(t.split('\n')[0]); continue; }
  const isJournal = JOURNAL.some((k) => t.includes(k));
  if (isDom) { isJournal ? domJ++ : domC++; }
  else { isJournal ? intlJ++ : intlC++; }
}
const intl = intlJ + intlC;
const dom = domJ + domC;
const total = intl + dom;
const sci = papers.filter((t) => /`SCIE?`/.test(t)).length;
const first = papers.filter((t) => /`1st(?:\s+author)?`/.test(t)).length;

// ── 활동 ──
const [actStart, actEnd] = sectionRange('Experience & Activities');
let activities = 0;
for (let i = actStart + 1; i < actEnd; i++) {
  const l = lines[i].trim();
  if (!l.startsWith('|')) continue;
  if (l.includes('기간') && l.includes('활동')) continue; // 헤더
  if (/^\|[\s:|-]+\|$/.test(l)) continue; // 구분선
  activities++;
}

if (unknown.length) {
  console.warn('⚠ 분류 안 된 항목 (DOMESTIC/INTERNATIONAL 키워드 추가 필요):');
  unknown.forEach((u) => console.warn('   ' + u));
}
console.log(`total=${total} intlJ=${intlJ} intlC=${intlC} domJ=${domJ} domC=${domC} sci=${sci} first=${first} activities=${activities} patents=${patents}`);

// ── 마커 사이 교체 ──
function replaceBetween(src, key, content) {
  const re = new RegExp(`(<!-- ${key}:START -->)[\\s\\S]*?(<!-- ${key}:END -->)`);
  if (!re.test(src)) { console.warn(`marker ${key} not found — skipped`); return src; }
  return src.replace(re, `$1\n${content}\n$2`);
}

const [awardStart, awardEnd] = sectionRange('Awards & Certifications');
const awards = lines.slice(awardStart + 1, awardEnd).filter((line) => line.startsWith('- 🏆')).length;
const badge = (label, value) => `<img src="https://img.shields.io/badge/${encodeURIComponent(label.replaceAll('-', '--'))}-${value}-425aaa?style=flat-square" alt="${label}: ${value}" />`;

const statsTable = [
  '<div align="center">',
  '<table align="center">',
  '  <tr>',
  '    <td align="left" valign="middle"><b>Research</b></td>',
  `    <td align="left" valign="middle" width="410">${badge('Publications', total)} ${badge('First-author papers', first)} ${badge('SCIE papers', sci)}<br/><sub>${intl} international / ${dom} domestic<br/>First-author / SCIE counts are subsets of total.</sub></td>`,
  '  </tr>',
  '  <tr>',
  '    <td align="left" valign="middle"><b>Achievements</b></td>',
  `    <td align="left" valign="middle" width="410">${badge('Granted patents', patents)} ${badge('Awards', awards)}</td>`,
  '  </tr>',
  '  <tr>',
  '    <td align="left" valign="middle"><b>Open source</b></td>',
  '    <td align="left" valign="middle" width="410"><a href="https://github.com/beomdo-park/QEnvS"><img align="middle" src="https://raw.githubusercontent.com/beomdo-park/QEnvS/main/docs/assets/qenvs_logo_1200.png" alt="QEnvS" width="88" /></a>&nbsp;&nbsp; <b>Quantum control toolkit</b></td>',
  '  </tr>',
  '</table>',
  '</div>',
].join('\n');

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const stamp = `<sub>📅 Last updated: ${today} (KST)</sub>`;

let md = md0;
md = replaceBetween(md, 'STATS', statsTable);
md = replaceBetween(md, 'UPDATED', stamp);

if (md !== md0) {
  writeFileSync(FILE, md);
  console.log('README.md updated.');
} else {
  console.log('No changes.');
}
