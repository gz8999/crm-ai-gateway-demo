export const MONTH_REVENUE_FIELDS = [
  "aigw_aprilactualrevenue",
  "aigw_mayactualrevenue",
  "aigw_juneactualrevenue",
  "aigw_julyactualrevenue",
  "aigw_augustactualrevenue",
  "aigw_septemberactualrevenue",
  "aigw_octoberactualrevenue",
  "aigw_novemberactualrevenue",
  "aigw_decemberactualrevenue",
  "aigw_januaryactualrevenue",
  "aigw_februaryactualrevenue",
  "aigw_marchactualrevenue",
];

function parseDecimal(value) {
  const text = value === null || value === undefined || value === "" ? "0" : String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError(`Invalid decimal value: ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  return {
    negative,
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function addDecimals(left, right) {
  const scale = Math.max(left.scale, right.scale);
  const leftDigits = (left.negative ? -left.digits : left.digits) * 10n ** BigInt(scale - left.scale);
  const rightDigits = (right.negative ? -right.digits : right.digits) * 10n ** BigInt(scale - right.scale);
  const digits = leftDigits + rightDigits;
  return { negative: digits < 0n, digits: digits < 0n ? -digits : digits, scale };
}

export function roundDecimalAwayFromZero(value, precision = 2) {
  if (!Number.isInteger(precision) || precision < 0) throw new TypeError("Precision must be a non-negative integer.");
  const parsed = parseDecimal(value);
  if (parsed.scale <= precision) {
    const digits = parsed.digits * 10n ** BigInt(precision - parsed.scale);
    return Number((parsed.negative ? -digits : digits)) / 10 ** precision;
  }
  const divisor = 10n ** BigInt(parsed.scale - precision);
  let quotient = parsed.digits / divisor;
  if (parsed.digits % divisor !== 0n) quotient += 1n;
  const signed = parsed.negative ? -quotient : quotient;
  return Number(signed) / 10 ** precision;
}

export function mergeRevenueFields(preImage = {}, target = {}) {
  return MONTH_REVENUE_FIELDS.reduce((merged, field) => {
    if (Object.prototype.hasOwnProperty.call(target, field)) merged[field] = target[field];
    else if (Object.prototype.hasOwnProperty.call(preImage, field)) merged[field] = preImage[field];
    else merged[field] = null;
    return merged;
  }, {});
}

export function calculateAnnualRevenue(preImage = {}, target = {}, precision = 2) {
  const merged = mergeRevenueFields(preImage, target);
  const total = MONTH_REVENUE_FIELDS.reduce((sum, field) => addDecimals(sum, parseDecimal(merged[field])), { negative: false, digits: 0n, scale: 0 });
  const signedText = `${total.negative ? "-" : ""}${total.digits}`;
  const decimalText = total.scale === 0
    ? signedText
    : `${signedText.slice(0, -total.scale) || "0"}.${signedText.slice(-total.scale).padStart(total.scale, "0")}`;
  return roundDecimalAwayFromZero(decimalText, precision);
}

export function decimalEqual(left, right, precision = 2) {
  return roundDecimalAwayFromZero(left ?? 0, precision) === roundDecimalAwayFromZero(right ?? 0, precision);
}
