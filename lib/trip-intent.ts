export type DestinationIntent = {
  destinationQuery: string;
  destinationLabel: string;
  days: number;
  startDate: string | null;
};

const CHINESE_NUMBER = "一二两三四五六七八九十";
const DAY_TOKEN = `[${CHINESE_NUMBER}\\d]+`;
const DESTINATION = `[\\p{L}\\p{M}][\\p{L}\\p{M}·.’'\\- ]{0,59}?`;
const TRIP_SIGNAL = /旅行|旅游|行程|度假|游玩|日游|trip|travel|vacation|itinerary/i;

export function parseSmallNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] ?? 0 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[value] ?? Number.NaN;
}

function isoDate(month: number, day: number, explicitYear: number | null, now: Date) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = explicitYear ?? now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (explicitYear == null && candidate < today) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseStartDate(text: string, now: Date) {
  const iso = text.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/);
  if (iso) return isoDate(Number(iso[2]), Number(iso[3]), Number(iso[1]), now);

  const chinese = text.match(new RegExp(`(?:(20\\d{2})年)?([${CHINESE_NUMBER}\\d]+)月([${CHINESE_NUMBER}\\d]+)[日号]`));
  if (chinese) return isoDate(parseSmallNumber(chinese[2]), parseSmallNumber(chinese[3]), chinese[1] ? Number(chinese[1]) : null, now);

  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const monthNames = Object.keys(months).join("|");
  const english = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+([0-3]?\\d)(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "i"));
  if (english) return isoDate(months[english[1].toLowerCase()], Number(english[2]), english[3] ? Number(english[3]) : null, now);
  return null;
}

function cleanDestination(value: string) {
  return value
    .replace(/^(?:一个|一趟|一次|the city of)\s*/i, "")
    .replace(/\s*(?:开始|出发|之旅)$/i, "")
    .replace(/[，,。.!！?？]+$/u, "")
    .trim();
}

function extractDestination(text: string) {
  const chineseVerb = new RegExp(`(?:计划去|准备去|打算去|想去|要去|前往|到|去)\\s*(${DESTINATION})(?=\\s*(?:${DAY_TOKEN}\\s*(?:天|日游)|旅行|旅游|行程|度假|游玩|玩|[，,。.!！?？]|$))`, "iu");
  const arranged = new RegExp(`(?:安排|制定|规划)\\s*(?:一个|一趟|一次)?\\s*(${DESTINATION})(?=\\s*(?:${DAY_TOKEN}\\s*(?:天|日游)|旅行|旅游|行程|度假|游玩|[，,。.!！?？]|$))`, "iu");
  const destinationFirst = new RegExp(`^\\s*(?:${DAY_TOKEN}月${DAY_TOKEN}[日号](?:开始|出发)?\\s*)?(${DESTINATION})(?=\\s*(?:${DAY_TOKEN}\\s*(?:天|日游)|旅行|旅游|行程|度假|游玩|玩))`, "iu");
  const englishVerb = new RegExp(`(?:want to (?:go to|visit)|plan to (?:go to|visit)|travel to|trip to|visit|go to)\\s+(${DESTINATION})(?=\\s+(?:for|starting|from|on)\\b|[,.!?]|$)`, "iu");

  for (const pattern of [chineseVerb, arranged, destinationFirst, englishVerb]) {
    const destination = cleanDestination(text.match(pattern)?.[1] ?? "");
    if (destination.length >= 2 && !/^(这里|那里|哪里|哪儿|旅游|旅行|行程|there|here)$/i.test(destination)) return destination;
  }
  return null;
}

export function parseDestinationIntent(text: string, now = new Date()): DestinationIntent | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  const chineseDays = normalized.match(new RegExp(`(${DAY_TOKEN})\\s*(?:天|日游)`));
  const englishDays = normalized.match(/\b(\d{1,2})\s*days?\b/i);
  const daysValue = chineseDays?.[1] ?? englishDays?.[1] ?? null;
  if (!daysValue && !TRIP_SIGNAL.test(normalized)) return null;

  const destination = extractDestination(normalized);
  if (!destination) return null;

  const parsedDays = daysValue ? parseSmallNumber(daysValue) : 3;
  return {
    destinationQuery: destination,
    destinationLabel: destination,
    days: Math.min(14, Math.max(1, Number.isFinite(parsedDays) ? parsedDays : 3)),
    startDate: parseStartDate(normalized, now),
  };
}

export function parseDestinationIntents(text: string, now = new Date()) {
  const segments = text
    .split(/(?:，|,|；|;)?\s*(?:(?:再|然后|接着|之后)\s*(?=(?:去|到|前往))|then\s+(?=(?:go to|visit|travel to)))/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    const single = parseDestinationIntent(text, now);
    return single ? [single] : [];
  }

  const intents = segments.flatMap((segment, index) => {
    const direct = parseDestinationIntent(segment, now);
    if (direct) return [direct];
    if (index === 0) return [];
    const implicit = parseDestinationIntent(`${segment}旅行`, now);
    return implicit ? [implicit] : [];
  });

  return intents.length === segments.length ? intents : [];
}
