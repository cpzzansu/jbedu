const sourcePath = "/jbstudy-g/M010503/list.do";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

const monthInput = document.querySelector("#monthInput");
const loadButton = document.querySelector("#loadButton");
const pdfButton = document.querySelector("#pdfButton");
const statusEl = document.querySelector("#status");
const reportEl = document.querySelector("#report");

function getDefaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function selectedMonthToYmd() {
  if (!monthInput.value) {
    monthInput.value = getDefaultMonthValue();
  }

  const [year, month] = monthInput.value.split("-");
  return `${year}${month}01`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageApi(path, query = "") {
  const params = new URLSearchParams({ path });
  if (query) params.set("query", query);
  return `/api/page?${params.toString()}`;
}

async function fetchHtml(path, query = "") {
  const response = await fetch(pageApi(path, query));
  if (!response.ok) {
    throw new Error(`페이지 요청 실패 (${response.status})`);
  }
  return response.text();
}

function parseDayLinks(doc) {
  return [
    ...new Map(
      [...doc.querySelectorAll('a[href*="ymd="], a[href*="YMD="]')]
        .map((anchor) => {
          const url = new URL(anchor.getAttribute("href"), "https://office.jbedu.kr");
          const ymd =
            url.searchParams.get("ymd") ||
            url.searchParams.get("YMD") ||
            anchor.href.match(/ymd=(\d{8})/i)?.[1];

          return ymd
            ? [
                ymd,
                {
                  ymd,
                  path: url.pathname,
                  query: url.searchParams.toString(),
                },
              ]
            : null;
        })
        .filter(Boolean)
    ).values(),
  ].sort((a, b) => a.ymd.localeCompare(b.ymd));
}

function getMonthTitle(doc) {
  return doc.body.innerText.match(/20\d{2}년\s*\d{1,2}월/)?.[0] || "월간 식단";
}

function getMonthPrefix(monthTitle) {
  const match = monthTitle.match(/(20\d{2})년\s*(\d{1,2})월/);
  if (!match) return "";
  return `${match[1]}${String(Number(match[2])).padStart(2, "0")}`;
}

function extractMenu(html, ymd) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const main =
    doc.querySelector("#contents, #content, main, .contents, .content, #container") || doc.body;

  let text = cleanText(main.innerText);
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const date = new Date(Number(ymd.slice(0, 4)), month - 1, day);
  const dateTitle = `${month}월 ${day}일 ${weekdays[date.getDay()]}요일`;
  const dateLineRe = new RegExp(`${month}\\s*월\\s*${day}\\s*일[^\\n]*요일`);

  const start = text.search(dateLineRe);
  if (start >= 0) text = text.slice(start);

  const stopWords = [
    "알레르기 정보",
    "원산지",
    "참고사항",
    "영양량",
    "칼로리",
    "탄수화물",
    "단백질",
    "지방",
    "비타민",
    "칼슘",
    "철분",
    "TOP",
    "하단 컨텐츠",
    "주소 :",
    "COPYRIGHT",
  ];

  const cutAt = stopWords
    .map((word) => text.indexOf(word))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];

  if (cutAt) text = text.slice(0, cutAt);

  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.replace(/^[-*ㆍ•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !dateLineRe.test(line));

  const mealIndex = lines.findIndex((line) => /^(조식|중식|석식)$/.test(line));
  const mealType = mealIndex >= 0 ? lines[mealIndex] : "중식";
  const menuItems = mealIndex >= 0 ? lines.slice(mealIndex + 1) : lines.filter((line) => line !== "중식");

  return {
    ymd,
    dateTitle,
    mealType,
    menuItems,
  };
}

function renderWeekdayCalendar(monthTitle, menus) {
  const match = monthTitle.match(/(20\d{2})년\s*(\d{1,2})월/);
  if (!match) return "<p class=\"empty\">월간 식단표를 만들지 못했습니다.</p>";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const menuByYmd = new Map(menus.map((menu) => [menu.ymd, menu]));
  const weeks = [];
  let week = Array(5).fill(null);

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    if (dow === 1 && week.some(Boolean)) {
      weeks.push(week);
      week = Array(5).fill(null);
    }

    const ymd = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
    week[dow - 1] = {
      day,
      menu: menuByYmd.get(ymd),
    };

    if (dow === 5) {
      weeks.push(week);
      week = Array(5).fill(null);
    }
  }

  if (week.some(Boolean)) weeks.push(week);

  const header = ["월", "화", "수", "목", "금"].map((day) => `<th>${day}</th>`).join("");
  const rows = weeks
    .map((weekRow) => {
      const cells = weekRow
        .map((cell) => {
          if (!cell) return "<td></td>";

          const menu = cell.menu;
          const items = menu?.menuItems?.length
            ? menu.menuItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
            : "<li class=\"muted\">식단 없음</li>";

          return `
            <td>
              <div class="calendar-day">${cell.day}</div>
              <div class="calendar-meal">${escapeHtml(menu?.mealType || "중식")}</div>
              <ul>${items}</ul>
            </td>
          `;
        })
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="weekday-calendar">
      <caption>${escapeHtml(monthTitle)} 평일 식단</caption>
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderReport({ monthTitle, calendarHtml, menus }) {
  const menuCards = menus
    .map((menu) => {
      const items = menu.menuItems.length
        ? menu.menuItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "<li class=\"muted\">등록된 메뉴가 없습니다.</li>";

      return `
        <article class="meal-card">
          <header>
            <h4>${escapeHtml(menu.dateTitle)}</h4>
            <span>${escapeHtml(menu.mealType || "중식")}</span>
          </header>
          <ul>${items}</ul>
        </article>
      `;
    })
    .join("");

  reportEl.innerHTML = `
    <section class="report-cover">
      <p>전북특별자치도교육청교육연수원</p>
      <h2>${escapeHtml(monthTitle)} 식단표</h2>
      <span>월간 식단표와 날짜별 중식 메뉴</span>
    </section>

    <section class="report-section">
      <h3>월간 식단표</h3>
      <div class="calendar-wrap">${calendarHtml}</div>
    </section>

    <section class="report-section">
      <h3>날짜별 메뉴</h3>
      <div class="meal-grid">${menuCards}</div>
    </section>
  `;
}

async function loadMeals() {
  loadButton.disabled = true;
  pdfButton.disabled = true;

  try {
    const selectedYmd = selectedMonthToYmd();
    setStatus(`${monthInput.value.replace("-", "년 ")}월 식단표를 가져오는 중입니다.`);
    const indexHtml = await fetchHtml(sourcePath, `ymd=${selectedYmd}`);
    const indexDoc = new DOMParser().parseFromString(indexHtml, "text/html");
    const monthTitle = getMonthTitle(indexDoc);
    const monthPrefix = getMonthPrefix(monthTitle);
    const dayLinks = parseDayLinks(indexDoc).filter((day) => day.ymd.startsWith(monthPrefix));

    if (!dayLinks.length) {
      throw new Error("현재 월의 날짜별 식단 링크를 찾지 못했습니다.");
    }

    const menus = [];

    for (const [index, day] of dayLinks.entries()) {
      setStatus(`날짜별 메뉴를 가져오는 중입니다. (${index + 1}/${dayLinks.length})`);
      const html = await fetchHtml(day.path, day.query);
      menus.push(extractMenu(html, day.ymd));
    }

    const calendarHtml = renderWeekdayCalendar(monthTitle, menus);
    renderReport({ monthTitle, calendarHtml, menus });
    pdfButton.dataset.filename = `${monthTitle.replace(/\s+/g, "_")}_식단표.pdf`;
    pdfButton.disabled = false;
    setStatus(`${monthTitle} 식단 ${menus.length}일치를 정리했습니다. PDF 다운로드를 누르세요.`);
  } catch (error) {
    reportEl.innerHTML = `
      <section class="report-cover error">
        <p>불러오기 실패</p>
        <h2>${escapeHtml(error.message)}</h2>
        <span>잠시 후 다시 시도해 주세요.</span>
      </section>
    `;
    setStatus(`오류: ${error.message}`);
  } finally {
    loadButton.disabled = false;
  }
}

async function downloadPdf() {
  const filename = pdfButton.dataset.filename || "식단표.pdf";

  if (window.mealPdf?.save) {
    pdfButton.disabled = true;
    setStatus("용량을 줄인 PDF를 저장하는 중입니다.");

    try {
      const result = await window.mealPdf.save(filename);
      setStatus(result.canceled ? "PDF 저장을 취소했습니다." : "PDF 저장을 완료했습니다.");
    } catch (error) {
      setStatus(`PDF 저장 실패: ${error.message}`);
    } finally {
      pdfButton.disabled = false;
    }

    return;
  }

  setStatus("인쇄 창이 열리면 대상에서 PDF 저장을 선택하세요.");
  window.print();
}

monthInput.value = getDefaultMonthValue();
loadButton.addEventListener("click", loadMeals);
pdfButton.addEventListener("click", downloadPdf);
