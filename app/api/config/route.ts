import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mapProvider: "OpenFreeMap",
    placeProvider: "OpenStreetMap",
    routeProvider: "FOSSGIS OSRM",
    apiKeyRequired: false,
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
