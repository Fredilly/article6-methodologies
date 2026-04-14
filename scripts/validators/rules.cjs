"use strict";
module.exports = validate;
module.exports.default = validate;

const RULE_TYPES = ["eligibility","calc","equation","monitoring","uncertainty","leakage","parameter","reporting"];

function validate(data) {
  const errors = [];
  
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push({ message: "must be object", instancePath: "" });
    validate.errors = errors;
    return false;
  }
  
  if (!data.rules) {
    errors.push({ message: "must have required property 'rules'", instancePath: "" });
    validate.errors = errors;
    return false;
  }
  
  // Check no extra top-level keys
  for (const key of Object.keys(data)) {
    if (key !== "rules") {
      errors.push({ message: "must NOT have additional properties: " + key, instancePath: "" });
    }
  }
  
  if (!Array.isArray(data.rules)) {
    errors.push({ message: "rules must be array", instancePath: "/rules" });
    validate.errors = errors;
    return false;
  }
  
  for (let i = 0; i < data.rules.length; i++) {
    const r = data.rules[i];
    const p = "/rules/" + i;
    
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.push({ message: "must be object", instancePath: p });
      continue;
    }
    
    // Required fields
    if (typeof r.id !== "string") errors.push({ message: "must have required property 'id'", instancePath: p });
    if (typeof r.title !== "string" || !r.title) errors.push({ message: "must have non-empty 'title'", instancePath: p });
    if (typeof r.logic !== "string" || !r.logic) errors.push({ message: "must have non-empty 'logic'", instancePath: p });
    if (typeof r.type !== "string") errors.push({ message: "must have required property 'type'", instancePath: p });
    else if (!RULE_TYPES.includes(r.type)) errors.push({ message: "type must be one of: " + RULE_TYPES.join(", "), instancePath: p + "/type" });
    
    // refs required
    if (!r.refs || typeof r.refs !== "object") {
      errors.push({ message: "must have required property 'refs'", instancePath: p });
    } else {
      if (!r.refs.primary_section || typeof r.refs.primary_section !== "string")
        errors.push({ message: "refs must have 'primary_section'", instancePath: p + "/refs" });
      if (!Array.isArray(r.refs.sections) || r.refs.sections.length < 1)
        errors.push({ message: "refs must have 'sections' array with minItems 1", instancePath: p + "/refs" });
      // Optional but type-checked
      if (r.refs.methodology !== undefined && typeof r.refs.methodology !== "string")
        errors.push({ message: "refs.methodology must be string", instancePath: p + "/refs/methodology" });
      if (r.refs.tools !== undefined) {
        if (!Array.isArray(r.refs.tools))
          errors.push({ message: "refs.tools must be array", instancePath: p + "/refs/tools" });
      }
    }
    
    // Check for removed duplicate fields
    if (r.text !== undefined) errors.push({ message: "'text' field removed — use 'title' instead", instancePath: p + "/text" });
    if (r.section_id !== undefined) errors.push({ message: "'section_id' moved to refs.primary_section", instancePath: p + "/section_id" });
    if (r.section_anchor !== undefined) errors.push({ message: "'section_anchor' moved to refs.section_anchor", instancePath: p + "/section_anchor" });
    if (r.section_number !== undefined) errors.push({ message: "'section_number' moved to refs.section_number", instancePath: p + "/section_number" });
    if (r.section_stable_id !== undefined) errors.push({ message: "'section_stable_id' moved to refs.section_stable_id", instancePath: p + "/section_stable_id" });
    if (r.tools !== undefined) errors.push({ message: "'tools' moved to refs.tools", instancePath: p + "/tools" });
    
    // Check no unknown fields (allowlist)
    const allowed = new Set(["id","stable_id","title","logic","type","refs","tags"]);
    for (const key of Object.keys(r)) {
      if (!allowed.has(key)) {
        errors.push({ message: "unknown field '" + key + "' — not in canonical contract", instancePath: p + "/" + key });
      }
    }
  }
  
  if (errors.length > 0) {
    validate.errors = errors;
    return false;
  }
  
  validate.errors = null;
  return true;
}
