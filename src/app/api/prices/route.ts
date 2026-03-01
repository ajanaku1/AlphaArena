import { NextResponse } from "next/server";
import { getCurrentPrices } from "@/lib/price-service";

export async function GET() {
  try {
    const prices = await getCurrentPrices();
    const priceObject: Record<string, number> = {};
    prices.forEach((price, symbol) => {
      priceObject[symbol] = price;
    });

    return NextResponse.json({
      success: true,
      data: priceObject,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
