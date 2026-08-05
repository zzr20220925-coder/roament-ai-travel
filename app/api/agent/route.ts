import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type AgentAction = {
  action: "destination_plan" | "place_search" | "dining_search" | "weather_replan" | "delay_replan" | "fatigue_replan" | "budget_replan" | "open_planner" | "general";
  destinationQuery: string | null;
  destinationLabel: string | null;
  tripDays: number | null;
  startDate: string | null;
  placeQuery: string | null;
  placeLabel: string | null;
  cuisineQuery: string | null;
  cuisineLabel: string | null;
  minRating: number | null;
  budgetAmount: number | null;
  budgetCurrency: "EUR" | "USD" | "GBP" | "JPY" | "CNY" | null;
  time: string | null;
  explanation: string;
};

type OpenAIResponse = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  error?: { message?: string };
};

function outputText(data: OpenAIResponse) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    prompt?: string;
    location?: { name?: string; lat?: number; lng?: number };
    timeline?: Array<{ time?: string; name?: string; status?: string }>;
  };
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: "请输入旅行需求" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, error: "OPENAI_API_KEY 尚未配置" }, { status: 503 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "你是 Michi 的旅行行动编排器。把用户的自然语言需求转换成一个明确的应用动作。",
        "不要虚构地点、评分、价格、营业时间或路线；地点与路线会由 OpenStreetMap 开放数据服务后续查询。",
        "如果用户提出前往某个城市或国家的多日旅行，并提到天数、开始日期、旅行或旅游，选择 destination_plan；不要误判为 place_search。",
        "destinationQuery 使用适合 OpenStreetMap 地址搜索的英文城市与国家，例如 New York, USA；destinationLabel 使用简体中文，例如纽约。",
        "tripDays 提取 1 到 14 天，没明确说时设为 3。startDate 使用 YYYY-MM-DD；用户只说月日时，结合 currentDate 选择最近的未来日期。",
        "例如‘我想去纽约五天，九月1号开始’必须返回 destination_plan、New York, USA、纽约、5 和相应的未来 ISO 日期。",
        "如果用户想去、参观、加入或安排一个具体地点或景点，选择 place_search。placeQuery 填适合 OpenStreetMap 搜索的简短地点名，必要时加上 travelCenter 所在城市；placeLabel 填用户熟悉的简体中文名称。",
        "例如用户说‘我想去凯旋门’，应返回 place_search，placeQuery 可为 Arc de Triomphe, Paris，placeLabel 为凯旋门。",
        "如果用户想吃饭、找餐厅或描述了菜系，选择 dining_search，并提取菜系与用餐时间。",
        "cuisineQuery 使用适合开放地点搜索的简短英文，例如 French restaurant；cuisineLabel 使用简体中文。",
        "开放地图不提供统一的商家评分和人均价格；即使用户提到这些偏好，也不要声称开放数据已验证。",
        "time 使用 24 小时 HH:MM。未说明景点时间时设为 null；未说明晚餐时间时设为 19:30；未说明评分时设为 null。",
        "预算币种只按用户明确表达提取；用户没说预算时 amount 和 currency 都设为 null。",
        "explanation 用一句简短中文说明准备执行什么，不要声称已经完成。",
      ].join("\n"),
      input: JSON.stringify({
        userRequest: prompt,
        currentDate: new Date().toISOString().slice(0, 10),
        travelCenter: body.location?.name ?? "未知",
        currentTimeline: body.timeline ?? [],
      }),
      text: {
        format: {
          type: "json_schema",
          name: "michi_travel_action",
          strict: true,
          schema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["destination_plan", "place_search", "dining_search", "weather_replan", "delay_replan", "fatigue_replan", "budget_replan", "open_planner", "general"] },
              destinationQuery: { type: ["string", "null"] },
              destinationLabel: { type: ["string", "null"] },
              tripDays: { type: ["integer", "null"], minimum: 1, maximum: 14 },
              startDate: { type: ["string", "null"] },
              placeQuery: { type: ["string", "null"] },
              placeLabel: { type: ["string", "null"] },
              cuisineQuery: { type: ["string", "null"] },
              cuisineLabel: { type: ["string", "null"] },
              minRating: { type: ["number", "null"], minimum: 1, maximum: 5 },
              budgetAmount: { type: ["number", "null"], minimum: 0 },
              budgetCurrency: { type: ["string", "null"], enum: ["EUR", "USD", "GBP", "JPY", "CNY", null] },
              time: { type: ["string", "null"] },
              explanation: { type: "string" },
            },
            required: ["action", "destinationQuery", "destinationLabel", "tripDays", "startDate", "placeQuery", "placeLabel", "cuisineQuery", "cuisineLabel", "minRating", "budgetAmount", "budgetCurrency", "time", "explanation"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const data = await response.json() as OpenAIResponse;
  if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "OpenAI 请求失败" }, { status: response.status });

  try {
    const action = JSON.parse(outputText(data)) as AgentAction;
    return NextResponse.json({ configured: true, action });
  } catch {
    return NextResponse.json({ error: "OpenAI 返回的旅行动作无法解析" }, { status: 502 });
  }
}
