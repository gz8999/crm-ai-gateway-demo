export const JSON_SCHEMA_DIAGNOSTICS_NAME = "Gateway JSON Schema Diagnostics";
export const JSON_SCHEMA_DIAGNOSTICS_VERSION = "1.1.0";

export function validateJsonSchemaWithDiagnostics(value, schema, {
  validatorName = JSON_SCHEMA_DIAGNOSTICS_NAME,
  validatorVersion = JSON_SCHEMA_DIAGNOSTICS_VERSION,
} = {}) {
  const errors = [];
  validateNode(value, schema, "", "#", errors, schema);
  return {
    ok: errors.length === 0,
    validatorName,
    validatorVersion,
    errors,
    legacyErrors: errors.map(toLegacyError),
  };
}

export function classifySchemaDiagnostic(error) {
  if (!error || typeof error !== "object") return "UNKNOWN_SCHEMA_FAILURE";
  if (error.keyword === "required") return "MISSING_REQUIRED_PROPERTY";
  if (error.keyword === "additionalProperties") return "UNEXPECTED_PROPERTY";
  if (error.keyword === "type") return "TYPE_MISMATCH";
  if (error.keyword === "enum") {
    if (/^\/safety(?:\/|$)/u.test(error.instancePath)) return "SAFETY_STATEMENT_INVALID";
    return error.allowedEnumCount === 1 ? "CONST_MISMATCH" : "ENUM_MISMATCH";
  }
  if (error.keyword === "minItems") return "ARRAY_MIN_ITEMS";
  if (error.keyword === "maxItems") return "ARRAY_MAX_ITEMS";
  if (error.keyword === "pattern") return "PATTERN_MISMATCH";
  if (error.keyword === "maxLength") return "STRING_TOO_LONG";
  return "UNKNOWN_SCHEMA_FAILURE";
}

function validateNode(value, schema, instancePath, schemaPath, errors, rootSchema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  if (typeof schema.$ref === "string") {
    const target = resolveLocalRef(rootSchema, schema.$ref);
    if (!target) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/$ref`, keyword: "$ref", actualJsonType: jsonType(value) }));
      return;
    }
    validateNode(value, target, instancePath, schema.$ref, errors, rootSchema);
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.map((branch, index) => {
      const branchErrors = [];
      validateNode(value, branch, instancePath, `${schemaPath}/anyOf/${index}`, branchErrors, rootSchema);
      return branchErrors;
    });
    if (!branches.some((branch) => branch.length === 0)) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/anyOf`, keyword: "anyOf", actualJsonType: jsonType(value), anyOfMatchCount: 0 }));
      const closest = closestBranch(branches);
      errors.push(...closest);
    }
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.map((branch, index) => {
      const branchErrors = [];
      validateNode(value, branch, instancePath, `${schemaPath}/oneOf/${index}`, branchErrors, rootSchema);
      return branchErrors;
    });
    const matchCount = branches.filter((branch) => branch.length === 0).length;
    if (matchCount !== 1) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/oneOf`, keyword: "oneOf", actualJsonType: jsonType(value), oneOfMatchCount: matchCount }));
      if (matchCount === 0) errors.push(...closestBranch(branches));
    }
    return;
  }
  if (Array.isArray(schema.allOf)) {
    const branches = schema.allOf.map((branch, index) => {
      const branchErrors = [];
      validateNode(value, branch, instancePath, `${schemaPath}/allOf/${index}`, branchErrors, rootSchema);
      return branchErrors;
    });
    const matchCount = branches.filter((branch) => branch.length === 0).length;
    if (matchCount !== branches.length) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/allOf`, keyword: "allOf", actualJsonType: jsonType(value), allOfMatchCount: matchCount }));
      errors.push(...branches.flatMap((branch) => branch));
    }
    return;
  }

  if (Object.hasOwn(schema, "const") && !Object.is(schema.const, value)) {
    errors.push(safeError({
      instancePath,
      schemaPath: `${schemaPath}/const`,
      keyword: "const",
      expectedType: schema.type || jsonType(schema.const),
      actualJsonType: jsonType(value),
      constMatched: false,
    }));
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(safeError({
      instancePath,
      schemaPath: `${schemaPath}/enum`,
      keyword: "enum",
      expectedType: schema.type || null,
      actualJsonType: jsonType(value),
      allowedEnumCount: schema.enum.length,
      enumMembership: false,
      fixedValueMatched: schema.enum.length === 1 ? false : null,
    }));
  }

  if (schema.type === "object") {
    if (!isRecord(value)) {
      errors.push(typeError(instancePath, schemaPath, "object", value));
      return;
    }
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) {
        errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/required`, keyword: "required", expectedType: "object", actualJsonType: "object", missingProperty: key }));
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${instancePath}/${escapePointer(key)}`;
      if (!Object.hasOwn(schema.properties || {}, key)) {
        errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/additionalProperties`, keyword: "additionalProperties", expectedType: "object", actualJsonType: "object", unexpectedProperty: key }));
      } else {
        validateNode(child, schema.properties[key], childPath, `${schemaPath}/properties/${escapePointer(key)}`, errors, rootSchema);
      }
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(typeError(instancePath, schemaPath, "array", value));
      return;
    }
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/minItems`, keyword: "minItems", expectedType: "array", actualJsonType: "array", arrayLength: value.length, minItems: schema.minItems, maxItems: integerOrNull(schema.maxItems) }));
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/maxItems`, keyword: "maxItems", expectedType: "array", actualJsonType: "array", arrayLength: value.length, minItems: integerOrNull(schema.minItems), maxItems: schema.maxItems }));
    }
    value.forEach((item, index) => validateNode(item, schema.items, `${instancePath}/${index}`, `${schemaPath}/items`, errors, rootSchema));
    return;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push(typeError(instancePath, schemaPath, "string", value));
      return;
    }
    if (Number.isInteger(schema.maxLength) && [...value].length > schema.maxLength) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/maxLength`, keyword: "maxLength", expectedType: "string", actualJsonType: "string", stringLength: [...value].length, minLength: integerOrNull(schema.minLength), maxLength: schema.maxLength }));
    }
    if (Number.isInteger(schema.minLength) && [...value].length < schema.minLength) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/minLength`, keyword: "minLength", expectedType: "string", actualJsonType: "string", stringLength: [...value].length, minLength: schema.minLength, maxLength: integerOrNull(schema.maxLength) }));
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(safeError({ instancePath, schemaPath: `${schemaPath}/pattern`, keyword: "pattern", expectedType: "string", actualJsonType: "string", stringLength: [...value].length, patternMatched: false }));
    }
    return;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") errors.push(typeError(instancePath, schemaPath, "boolean", value));
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) errors.push(typeError(instancePath, schemaPath, "number", value));
  if (schema.type === "integer" && !Number.isInteger(value)) errors.push(typeError(instancePath, schemaPath, "integer", value));
}

function typeError(instancePath, schemaPath, expectedType, value) {
  return safeError({ instancePath, schemaPath: `${schemaPath}/type`, keyword: "type", expectedType, actualJsonType: jsonType(value) });
}

function safeError(value) {
  return {
    instancePath: value.instancePath || "",
    schemaPath: value.schemaPath || "#",
    keyword: value.keyword || "unknown",
    expectedType: value.expectedType ?? null,
    expectedJsonType: value.expectedType ?? null,
    actualJsonType: value.actualJsonType ?? null,
    missingProperty: value.missingProperty ?? null,
    unexpectedProperty: value.unexpectedProperty ?? null,
    additionalProperty: value.unexpectedProperty ?? null,
    allowedEnumCount: value.allowedEnumCount ?? null,
    enumMembership: value.enumMembership ?? null,
    arrayLength: value.arrayLength ?? null,
    minItems: value.minItems ?? null,
    maxItems: value.maxItems ?? null,
    stringLength: value.stringLength ?? null,
    minLength: value.minLength ?? null,
    maxLength: value.maxLength ?? null,
    patternMatched: value.patternMatched ?? null,
    fixedValueMatched: value.fixedValueMatched ?? null,
    constMatched: value.constMatched ?? value.fixedValueMatched ?? null,
    oneOfMatchCount: value.oneOfMatchCount ?? null,
    anyOfMatchCount: value.anyOfMatchCount ?? null,
    allOfMatchCount: value.allOfMatchCount ?? null,
  };
}

function toLegacyError(error) {
  const path = pointerToLegacyPath(error.instancePath);
  if (error.keyword === "required") return `${path}:missing:${error.missingProperty}`;
  if (error.keyword === "additionalProperties") return `${path}:extra:${error.unexpectedProperty}`;
  if (error.keyword === "type") return `${path}:${error.expectedType}`;
  if (error.keyword === "enum") return `${path}:enum`;
  if (error.keyword === "const") return `${path}:const`;
  if (error.keyword === "minLength") return `${path}:minLength`;
  if (error.keyword === "maxLength") return `${path}:maxLength`;
  if (error.keyword === "pattern") return `${path}:pattern`;
  if (error.keyword === "anyOf") return `${path}:anyOf`;
  if (error.keyword === "oneOf") return `${path}:oneOf`;
  if (error.keyword === "allOf") return `${path}:allOf`;
  if (error.keyword === "$ref") return `${path}:ref`;
  return `${path}:${error.keyword}`;
}

function pointerToLegacyPath(pointer) {
  if (!pointer) return "$";
  return pointer.split("/").slice(1).reduce((path, part) => {
    const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
    return /^\d+$/u.test(decoded) ? `${path}[${decoded}]` : `${path}.${decoded}`;
  }, "$");
}

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function escapePointer(value) { return String(value).replaceAll("~", "~0").replaceAll("/", "~1"); }
function integerOrNull(value) { return Number.isInteger(value) ? value : null; }
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function resolveLocalRef(rootSchema, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((node, part) => node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema) || null;
}

function closestBranch(branches) {
  return [...branches].sort((left, right) => discriminatorErrorCount(left) - discriminatorErrorCount(right) || left.length - right.length)[0] || [];
}

function discriminatorErrorCount(errors) {
  return errors.filter((error) => ["enum", "const"].includes(error.keyword) && /\/(?:code|inferenceCode|actionCode)$/u.test(error.instancePath)).length;
}
