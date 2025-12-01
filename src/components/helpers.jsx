export function beautifyCostCentValue(value) {
  if (!value) return "0ct";
  if (value >= 100) return roundToXDigits(value / 100, 3) + "€";
  if (value < 1) {
    if (value < 0.000001) return "<0.000001ct";
    return roundToXDigits(value, 6) + "ct";
  }
  return roundToXDigits(value, 3) + "ct";
}

function roundToXDigits(number, digits) {
  const scale = 10 ** digits;
  return Math.round((number + Number.EPSILON) * scale) / scale;
}
