function recordId(record) {
  return record?.opportunityid || record?.aigw_actualmanagementid || record?.id || null;
}

export function resolveLiteralMarkerRecords(records, marker) {
  if (typeof marker !== "string" || marker.length === 0) throw new TypeError("Literal marker must be a non-empty string.");
  const candidates = Array.isArray(records) ? records : [];
  const literalRecords = candidates.filter((record) => typeof record?.name === "string" && record.name.startsWith(marker));
  const rejectedRecords = candidates.filter((record) => !literalRecords.includes(record));
  return {
    candidateCount: candidates.length,
    literalMatchCount: literalRecords.length,
    rejectedCandidateCount: rejectedRecords.length,
    literalMatchIds: literalRecords.map(recordId).filter(Boolean),
    rejectedCandidateIds: rejectedRecords.map(recordId).filter(Boolean),
    literalRecords,
    rejectedCandidateSummaries: rejectedRecords.map((record) => ({ id: recordId(record), nameIsString: typeof record?.name === "string" })),
  };
}
