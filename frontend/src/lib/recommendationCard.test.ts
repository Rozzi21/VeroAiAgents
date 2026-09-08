import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TripPackage } from "./api.ts";
import { formatIDR } from "./format.ts";
import { recommendationCardView } from "./recommendationCard.ts";

function packageFixture(overrides: Partial<TripPackage> = {}): TripPackage {
  return {
    id: "trip-1",
    title: "Bali Adventure",
    slug: "bali-adventure",
    destination: "Bali",
    location: "Ubud",
    category: "domestic",
    status: "published",
    summary: "Rafting dan tur pura.",
    overview: "",
    duration: "3D2N",
    image_url: "",
    estimated_price: 2_000_000,
    base_price: 2_000_000,
    discount_enabled: true,
    discount_price: 1_500_000,
    child_price: 1_000_000,
    child_discount_enabled: true,
    child_discount_price: 750_000,
    ...overrides,
  };
}

test("recommendation card view exposes authoritative package and pricing fields", () => {
  const view = recommendationCardView(packageFixture());

  assert.equal(view.title, "Bali Adventure");
  assert.equal(view.destination, "Bali");
  assert.equal(view.duration, "3D2N");
  assert.equal(view.adultPrice?.displayPrice, 1_500_000);
  assert.equal(view.adultPrice?.originalPrice, 2_000_000);
  assert.equal(view.adultPrice?.percent, 25);
  assert.equal(view.childPrice?.displayPrice, 750_000);
  assert.equal(view.childPrice?.originalPrice, 1_000_000);
  assert.equal(formatIDR(view.adultPrice?.displayPrice), "Rp 1.500.000");
});

test("old recommendation without optional prices remains renderable without fake values", () => {
  const view = recommendationCardView(
    packageFixture({
      base_price: 0,
      estimated_price: 0,
      discount_enabled: undefined,
      discount_price: undefined,
      child_price: undefined,
      child_discount_enabled: undefined,
      child_discount_price: undefined,
      duration: "",
    })
  );

  assert.equal(view.title, "Bali Adventure");
  assert.equal(view.destination, "Bali");
  assert.equal(view.duration, "");
  assert.equal(view.adultPrice, null);
  assert.equal(view.childPrice, null);
});

test("RecommendationCard renders structured price, destination, and duration view", () => {
  const source = readFileSync(
    new URL("../components/cards/RecommendationCard.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /recommendationCardView\(trip\)/);
  assert.match(source, /view\.destination/);
  assert.match(source, /view\.duration/);
  assert.match(source, /TripPriceInline price=\{view\.adultPrice\}/);
  assert.match(source, /TripPriceInline price=\{view\.childPrice\}/);
  assert.doesNotMatch(source, /message\.content|assistant/i);
});