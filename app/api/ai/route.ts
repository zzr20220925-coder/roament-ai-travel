import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      demo: true,
      message: "OPENAI_API_KEY 尚未配置，当前使用编辑审核过的示例讲解。",
    });
  }

  const body = await request.json() as {
    kind?: "place" | "itinerary";
    place?: string;
    hotel?: string;
    preferences?: string[];
    days?: number;
  };

  const isItinerary = body.kind === "itinerary";
  const input = isItinerary
    ? `请为住在 ${body.hotel ?? "用户酒店"} 的游客制定 ${body.days ?? 3} 日行程。偏好：${(body.preferences ?? []).join("、")}。每天从酒店出发，考虑地点营业时间、步行强度、交通衔接和用餐。`
    : `请讲解景点 ${body.place ?? "未知地点"}。说明它为什么值得去、关键历史背景、最佳到访时间、建议停留时长与一条容易被忽略的参观提示。`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      tools: [{ type: "web_search" }],
      instructions: "你是严谨的海外旅行研究员。使用简体中文。地名保留当地语言或英文。把事实与建议区分开，不确定的信息明确说明；涉及营业时间、票价、交通中断时提醒用户以官方实时信息为准。输出简洁、可执行，并附所用来源。",
      input,
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json({ error: data?.error?.message ?? "AI 请求失败" }, { status: response.status });
  }
  return NextResponse.json(data);
}
