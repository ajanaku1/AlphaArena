import { NextResponse } from "next/server"
import { getActiveCompetitions } from "@/server/trader"

export async function GET() {
  try {
    const competitions = await getActiveCompetitions()

    return NextResponse.json({ competitions })
  } catch (error) {
    console.error("Error fetching competitions:", error)
    return NextResponse.json(
      { error: "Failed to fetch competitions" },
      { status: 500 }
    )
  }
}
