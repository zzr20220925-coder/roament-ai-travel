import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type CandidatePlace = {
  id?: string;
  name?: string;
  localName?: string;
  category?: string;
  distance?: string;
  address?: string;
  opening?: string;
  tags?: string[];
};

type ModelStop = {
  placeId: string;
  time: string;
  endTime: string;
  optional: boolean;
  note: string;
};

type ModelDay = {
  day: number;
  title: string;
  stops: ModelStop[];
};

type ModelPlan = {
  summary: string;
  days: ModelDay[];
};

type OpenAIResponse = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  error?: { message?: string };
};

function outputText(data: OpenAIResponse) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function safeText(value: unknown, fallback: string, maxLength = 90) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    mode?: "generate" | "modify";
    prompt?: string;
    location?: { name?: string; lat?: number; lng?: number };
    days?: number;
    pace?: string;
    budget?: string;
    companions?: string;
    interests?: string[];
    candidates?: CandidatePlace[];
    currentTimeline?: Array<{ placeId?: string; name?: string; time?: string; endTime?: string; status?: string; note?: string }>;
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, error: "OPENAI_API_KEY 尚未配置" }, { status: 503 });
  }

  const mode = body.mode === "modify" ? "modify" : "generate";
  const requestedDays = mode === "modify" ? 1 : Math.min(14, Math.max(1, Math.round(body.days ?? 3)));
  const candidates = (body.candidates ?? [])
    .filter((place): place is CandidatePlace & { id: string; name: string } => typeof place.id === "string" && Boolean(place.id) && typeof place.name === "string" && Boolean(place.name))
    .slice(0, 60)
    .map((place) => ({
      id: place.id,
      name: place.name,
      localName: safeText(place.localName, place.name, 80),
      category: safeText(place.category, "attraction", 20),
      distance: safeText(place.distance, "距离待计算", 40),
      address: safeText(place.address, "地址待确认", 120),
      opening: safeText(place.opening, "营业时间待确认", 80),
      tags: Array.isArray(place.tags) ? place.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8) : [],
    }));

  if (candidates.length < 2) {
    return NextResponse.json({ error: "开放地图候选地点不足，请先输入酒店或城市" }, { status: 400 });
  }

  const maxStops = body.pace === "慢游" ? 4 : body.pace === "充实" ? 7 : 5;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "你是严谨的海外旅行行程编排器。使用简体中文，为真实可执行的旅行负责。",
        "只能选择输入 candidatePlaces 中存在的 placeId；绝不能创造地点、坐标、评分、价格、营业时间或预订状态。",
        "优先把同一区域的地点排在同一天，减少折返；每天从酒店旅行中心出发，并为交通、吃饭和休息留出合理间隔。",
        "根据节奏限制每日站数。慢游强调停留质量，亲子与疲劳需求要减少连续步行，节省预算优先免费或公共空间。",
        "opening 字段可能是开放数据摘要而不是实时信息。不要保证开放、票价或预约；需要核对时在 note 里明确提醒。",
        "修改模式必须直接执行用户的修改意图，同时尽量保留当前行程中未受影响的合理安排。",
        "时间必须使用 24 小时 HH:MM，endTime 必须晚于 time。note 用一句可执行中文说明安排理由，不超过 45 字。",
        "summary 用一句中文说明这次计划或修改解决了什么，不要声称已验证实时信息。",
      ].join("\n"),
      input: JSON.stringify({
        task: mode,
        userRequest: safeText(body.prompt, mode === "modify" ? "优化当前行程" : "生成专属行程", 500),
        travelCenter: body.location ?? {},
        requestedDays,
        preferences: {
          pace: safeText(body.pace, "松弛", 20),
          budget: safeText(body.budget, "适中", 20),
          companions: safeText(body.companions, "两人", 20),
          interests: Array.isArray(body.interests) ? body.interests.slice(0, 10) : [],
          maximumStopsPerDay: maxStops,
        },
        currentTimeline: mode === "modify" ? (body.currentTimeline ?? []).slice(0, 10) : [],
        candidatePlaces: candidates,
      }),
      max_output_tokens: 5000,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "open_map_itinerary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              days: {
                type: "array",
                minItems: requestedDays,
                maxItems: requestedDays,
                items: {
                  type: "object",
                  properties: {
                    day: { type: "integer", minimum: 1, maximum: requestedDays },
                    title: { type: "string" },
                    stops: {
                      type: "array",
                      minItems: 1,
                      maxItems: maxStops,
                      items: {
                        type: "object",
                        properties: {
                          placeId: { type: "string" },
                          time: { type: "string" },
                          endTime: { type: "string" },
                          optional: { type: "boolean" },
                          note: { type: "string" },
                        },
                        required: ["placeId", "time", "endTime", "optional", "note"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["day", "title", "stops"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "days"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  const data = await response.json() as OpenAIResponse;
  if (!response.ok) {
    return NextResponse.json({ error: data.error?.message ?? "OpenAI 行程规划请求失败" }, { status: response.status });
  }

  let parsed: ModelPlan;
  try {
    parsed = JSON.parse(outputText(data)) as ModelPlan;
  } catch {
    return NextResponse.json({ error: "OpenAI 返回的行程无法解析" }, { status: 502 });
  }

  const allowedIds = new Set(candidates.map((place) => place.id));
  const days = (Array.isArray(parsed.days) ? parsed.days : []).slice(0, requestedDays).map((day, dayIndex) => {
    const seen = new Set<string>();
    const stops = (Array.isArray(day.stops) ? day.stops : []).filter((stop) => {
      if (!allowedIds.has(stop.placeId) || seen.has(stop.placeId) || !validTime(stop.time) || !validTime(stop.endTime) || stop.endTime <= stop.time) return false;
      seen.add(stop.placeId);
      return true;
    }).slice(0, maxStops).map((stop) => ({
      placeId: stop.placeId,
      time: stop.time,
      endTime: stop.endTime,
      optional: Boolean(stop.optional),
      note: safeText(stop.note, "按路线顺序到访，实时信息请在出发前核对", 90),
    }));
    return { day: dayIndex + 1, title: safeText(day.title, `第 ${dayIndex + 1} 天`, 40), stops };
  }).filter((day) => day.stops.length > 0);

  if (days.length === 0) {
    return NextResponse.json({ error: "AI 没有选出可验证的开放地图地点" }, { status: 502 });
  }

  return NextResponse.json({
    configured: true,
    summary: safeText(parsed.summary, "已根据你的需求重新编排行程", 160),
    days,
  });
}
