const SYSTEM_DATE_FIELDS = new Set([
  "createdon",
  "modifiedon",
  "overriddencreatedon",
  "scheduledstart",
  "scheduledend",
  "actualstart",
  "actualend",
]);

export const PLANNED_DATE_LABEL = "【计划节点日期】";
export const RECORD_CONTENT_LABEL = "【记录内容】";

export function normalizeDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date((Number(value) - 25569) * 86400000).toISOString().slice(0, 10);
}

export function buildPlannedAnnotationBody({ businessDate, originalBody }) {
  const date = normalizeDate(businessDate);
  const body = String(originalBody || "");
  const marker = `${PLANNED_DATE_LABEL}\n${date}`;
  if (body.includes(marker)) return body;
  return `${marker}\n\n${RECORD_CONTENT_LABEL}\n${body}`;
}

export function classifyTimelineRow(row, executionServerDate) {
  const type = String(row.activity_entity);
  if (type !== "annotation") return type;
  return normalizeDate(row.scheduledend_or_actualend) > normalizeDate(executionServerDate)
    ? "future-annotation"
    : "past-or-current-annotation";
}

export function buildAnnotationPayload({
  subject,
  originalBody,
  businessDate,
  executionServerDate,
  parentNavigation,
  parentEntitySet,
  parentId,
}) {
  const future = normalizeDate(businessDate) > normalizeDate(executionServerDate);
  const payload = {
    subject,
    notetext: future
      ? buildPlannedAnnotationBody({ businessDate, originalBody })
      : originalBody,
    [`${parentNavigation}@odata.bind`]: `/${parentEntitySet}(${parentId})`,
  };

  if (!future) {
    payload.isdocument = false;
    payload.mimetype = "text/plain";
    payload.overriddencreatedon = `${normalizeDate(businessDate)}T09:00:00Z`;
  }

  return payload;
}

export function assertFutureAnnotationPayload(payload) {
  const keys = Object.keys(payload);
  const bindKeys = keys.filter((key) => key.endsWith("@odata.bind"));
  if (keys.length !== 3 || !keys.includes("subject") || !keys.includes("notetext") || bindKeys.length !== 1) {
    throw new Error("Future Annotation payload contains unapproved fields");
  }
  if (keys.some((key) => SYSTEM_DATE_FIELDS.has(key))) {
    throw new Error("Future Annotation payload contains a system date field");
  }
  return true;
}

export function hasSystemDateField(payload) {
  return Object.keys(payload).some((key) => SYSTEM_DATE_FIELDS.has(key));
}
