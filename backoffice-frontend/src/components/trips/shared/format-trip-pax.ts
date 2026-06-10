export function formatTripPax(adultPax = 0, childPax = 0): string {
  const total = adultPax + childPax;
  if (total === 0) {
    return "0 pax";
  }
  if (adultPax > 0 && childPax > 0) {
    return `${adultPax} adult / ${childPax} child pax`;
  }
  if (adultPax > 0) {
    return `${adultPax} pax`;
  }
  return `${childPax} child pax`;
}
